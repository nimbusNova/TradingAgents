# PRD: Open-Source Release + Paid Hosted Platform

**Status:** Draft  
**Author:** nimbusnova  
**Date:** 2026-04-26

---

## 1. Overview

TradingAgents is a multi-agent LLM trading analysis system. This PRD covers two parallel efforts:

1. **Open-Source Release** — publish the repo publicly with no secrets exposed, so developers can self-host with their own API keys.
2. **Paid Hosted Platform** — a cloud-hosted version where users buy report credits and run analyses without any setup. This is the primary revenue model.

**Hosting stack:** Vercel (Next.js frontend) + Railway (FastAPI backend) + Supabase (Postgres + Auth).

> **Why not 100% Vercel?** Vercel serverless functions have a max 300-second timeout (Pro tier). A single TradingAgents analysis runs for 3–8 minutes, uses an in-process asyncio queue, and streams SSE responses — none of which fit the serverless model. Vercel handles the frontend perfectly; Railway handles the long-running Python process. Supabase replaces both the SQLite database and all custom auth code.

---

## 2. Goals

| Goal | Success metric |
|------|----------------|
| Repo is safe to make public | `git log --all -S "sk-" --oneline` returns nothing |
| Developers can self-host in < 15 min | README walk-through tested end to end |
| Users can purchase and consume credits | Stripe test-mode checkout → credits appear → run completes → credit deducted |
| Revenue from hosted reports | First paying customer within 30 days of launch |

---

## 3. Part 1 — Open-Source Release

### 3.1 Security audit (do before making repo public)

| Item | Current state | Action |
|------|---------------|--------|
| `.env` | Gitignored ✓ | Confirm with `git ls-files .env` — must return nothing |
| `.env.example` | Tracked, empty values ✓ | No action needed |
| `.env.enterprise.example` | Tracked, empty values ✓ | No action needed |
| LLM clients | Read keys from `os.environ` ✓ | No action needed |
| `web.db` | Stored at `~/.tradingagents/` (outside repo) ✓ | No action needed |
| Git history | Unknown | Run `git log --all -S "sk-" --oneline` — if anything appears, use `git filter-repo` to scrub before going public |

### 3.2 Files to add before going public

**`README.md`** (root-level) — covers:
- What it is + screenshot
- Quick-start: clone → `cp .env.example .env` → fill in one API key → `./start.sh`
- Docker Compose path for production self-hosting
- Link to the hosted platform for users who don't want to self-host

**`LICENSE`** — MIT. Allows free self-hosting; does not restrict the commercial hosted platform.

**`.env.example`** — already exists; verify all required env vars are listed (add `FINNHUB_API_KEY=` if missing).

### 3.3 Scope of the open-source version

The open-source repo is the full analysis engine. Users bring their own LLM API keys and run it themselves. There is no credit system, no auth, and no payment — those exist only in the hosted platform.

---

## 4. Part 2 — Paid Hosted Platform

### 4.1 Business model

Users purchase **credit packs**. Each completed analysis costs **1 credit**.

| Pack | Price (suggested) | Cost per report |
|------|-------------------|-----------------|
| Starter — 5 credits | $9 | $1.80 |
| Value — 10 credits | $15 | $1.50 |
| Pro — 25 credits | $29 | $1.16 |

**LLM cost note:** One analysis at depth=1 using `gpt-5.4-mini` (quick) + `gpt-5.4` (deep) costs roughly $0.30–0.60 in API fees. The host absorbs this; users do not supply their own keys on the hosted platform.

Credits are consumed only when a run reaches `status=done`. Failed or errored runs do **not** deduct a credit.

---

### 4.2 Infrastructure stack

```
Browser
  │
  ├─── HTTPS ──► Vercel  (Next.js 15 App Router)
  │                │
  │                ├── next.config.ts rewrites /api/* ──► Railway (FastAPI)
  │                │                                          │
  │                └── Vercel API routes /api/billing/*       │
  │                         │                                 │
  └─── SSE direct ──────────┼────────────────────────────────┘
                             │
                        Supabase
                    (Postgres + Auth + RLS)
```

**Vercel** — serves the Next.js frontend. Simple API routes (`/api/billing/*`) run as Vercel serverless functions because they are short-lived (< 10 seconds).

**Railway** — runs the FastAPI backend as a persistent process. Handles the analysis queue, LLM calls, and SSE streaming. No timeout constraint. Receives `BACKEND_URL` in Vercel's environment so `next.config.ts` rewrites point to it.

**SSE note:** The browser connects to the SSE stream **directly via Railway** (`NEXT_PUBLIC_API_URL/api/runs/{id}/stream`), bypassing the Vercel proxy. This avoids Vercel's streaming proxy timeout. All other API calls go through the Vercel rewrite as today.

**Supabase** — managed Postgres, Auth (email/password + OAuth), and Row Level Security. Replaces both `web.db` (SQLite) and all custom auth code.

---

### 4.3 Authentication — Supabase Auth

Supabase Auth replaces all custom JWT code. It handles sign-up, login, password reset, and session cookies out of the box.

**Packages:**
- `@supabase/supabase-js` — Supabase client
- `@supabase/ssr` — Next.js App Router helpers (server components + middleware)

**Session flow:**
1. User signs up / logs in via Supabase Auth (email + password in v1)
2. Supabase sets a secure httpOnly cookie containing the session JWT
3. Next.js `middleware.ts` calls `supabase.auth.getUser()` on every request — redirects to `/login` if unauthenticated on protected routes
4. Server components read the session via `createServerClient` from `@supabase/ssr`
5. The FastAPI backend verifies the Supabase JWT using `SUPABASE_JWT_SECRET` — no separate auth system needed

**New pages:**
- `app/(auth)/login/page.tsx` — Supabase Auth UI or a simple form calling `supabase.auth.signInWithPassword()`
- `app/(auth)/register/page.tsx` — `supabase.auth.signUp()`
- Password reset is handled by Supabase's built-in email flow; no custom code needed

---

### 4.4 Database — Supabase Postgres

**Connection:**
- Next.js server components and Vercel API routes use `@supabase/supabase-js` with the **anon key** (RLS enforced) or **service role key** (bypasses RLS, for billing webhook only)
- FastAPI on Railway connects via `DATABASE_URL` (Supabase connection pooler URL, `pgbouncer` mode) using `asyncpg` / `aiosqlite` → `asyncpg`

#### Schema additions

```sql
-- Add user ownership to existing runs table
ALTER TABLE runs ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Credits ledger: one row per purchase (+N) or run deduction (-1)
CREATE TABLE credits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  delta      INTEGER NOT NULL,   -- +10 for purchase, -1 for run completion
  reason     TEXT,               -- 'purchase:cs_stripe_xxx' | 'run:run-uuid'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Row Level Security policies

```sql
-- Users see and create only their own runs
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON runs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users see only their own credits
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credits" ON credits
  FOR SELECT USING (auth.uid() = user_id);
-- Inserts are server-only (service role); no client insert policy needed
```

Credit balance query:
```sql
SELECT COALESCE(SUM(delta), 0) AS balance
FROM credits WHERE user_id = $1;
```

---

### 4.5 Backend changes (FastAPI on Railway)

#### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/runs` | Verify Supabase JWT from `Authorization: Bearer <token>` header; check credit balance ≥ 1 via Supabase; attach `user_id` to run row |
| `GET /api/runs` | Filter by `user_id` from JWT |
| `GET /api/runs/{id}` | Return 403 if `run.user_id ≠ JWT user_id` |

#### Run completion → credit deduction

In `run_queue.py`, when a run transitions to `done`:

```python
await supabase_admin.table("credits").insert({
    "user_id": run.user_id,
    "delta": -1,
    "reason": f"run:{run.id}",
}).execute()
```

Uses the **service role key** (set as `SUPABASE_SERVICE_ROLE_KEY` env var on Railway) so RLS is bypassed for this server-side write.

#### New dependency

```
# backend/requirements.txt additions
supabase==2.x          # supabase-py client
asyncpg==0.x           # async Postgres driver replacing aiosqlite
```

---

### 4.6 Frontend changes (Vercel)

| File | Change |
|------|--------|
| `middleware.ts` | New — use `@supabase/ssr` to check session; redirect `/run/*` and `/run/new` to `/login` if unauthenticated |
| `Navigation.tsx` | Add credit balance chip (fetched from Supabase) + "Buy" link; Login/Register links when logged out |
| `RunWizard.tsx` | When `HOSTED_MODE=true`, skip Provider + Models steps; pass `Authorization: Bearer <token>` on run creation |
| `app/(auth)/login/page.tsx` | New — Supabase sign-in form |
| `app/(auth)/register/page.tsx` | New — Supabase sign-up form |
| `app/billing/page.tsx` | New — credit pack grid; POST to `/api/billing/checkout`; handle `?success=1` redirect |
| `lib/supabase.ts` | New — exports `createBrowserClient` and `createServerClient` helpers |

---

### 4.7 Billing — Stripe + Vercel API routes

The Stripe integration lives entirely in Vercel API routes (short-lived, no queue needed).

#### New Vercel API routes

| Route | Handler |
|-------|---------|
| `app/api/billing/checkout/route.ts` | Create Stripe Checkout Session; embed `user_id` and `credits` in `metadata`; return `url` |
| `app/api/billing/webhook/route.ts` | Verify Stripe signature; on `checkout.session.completed`, insert `delta=+N` row in Supabase `credits` table using service role key |

#### Purchase flow

1. User clicks "Buy 10 credits — $15"
2. `POST /api/billing/checkout` → Stripe Checkout Session created → return `{ url }`
3. Browser redirects to Stripe-hosted checkout
4. Payment succeeds → Stripe POSTs `checkout.session.completed` to `https://your-app.vercel.app/api/billing/webhook`
5. Vercel route verifies Stripe signature → inserts `{ user_id, delta: +10, reason: "purchase:cs_xxx" }` into Supabase
6. User lands on `/billing?success=1` → credit balance refreshes via `supabase.from("credits").select()`

---

### 4.8 Hosted model config

On the hosted platform, the Provider and Models wizard steps are hidden. The backend uses a fixed model set configured via environment variables:

```bash
HOSTED_MODE=true
HOSTED_QUICK_MODEL=gpt-5.4-mini
HOSTED_DEEP_MODEL=gpt-5.4
HOSTED_PROVIDER=openai
```

The frontend reads `NEXT_PUBLIC_HOSTED_MODE=true` and skips steps 3 and 4 of `RunWizard`. Users choose: ticker, date, analysts, depth, language.

---

### 4.9 Environment variables

**Vercel (frontend + billing routes)**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # billing webhook only — never NEXT_PUBLIC_
BACKEND_URL=https://your-api.up.railway.app
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app  # direct SSE connection
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_5=price_xxx
STRIPE_PRICE_10=price_xxx
STRIPE_PRICE_25=price_xxx
NEXT_PUBLIC_HOSTED_MODE=true
```

**Railway (FastAPI backend)**

```bash
DATABASE_URL=postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # for credit deduction writes
SUPABASE_JWT_SECRET=...                    # from Supabase dashboard → Settings → API → JWT Secret
OPENAI_API_KEY=sk-...                      # (or whichever provider the hosted platform uses)
HOSTED_MODE=true
HOSTED_QUICK_MODEL=gpt-5.4-mini
HOSTED_DEEP_MODEL=gpt-5.4
HOSTED_PROVIDER=openai
```

---

### 4.10 Deployment steps

1. **Supabase:** Create project → run schema migrations (alter `runs`, create `credits`, enable RLS, add policies)
2. **Railway:** Connect GitHub repo → set `backend/` as root → add all Railway env vars → deploy
3. **Vercel:** Connect GitHub repo → set `frontend/` as root → add all Vercel env vars → deploy
4. **Stripe:** Create products + prices → copy Price IDs to Vercel env → configure webhook endpoint to `https://your-app.vercel.app/api/billing/webhook`
5. **DNS:** Point custom domain at Vercel; add Railway domain as `NEXT_PUBLIC_API_URL` for direct SSE

---

## 5. Open Questions

| # | Question | Default assumption |
|---|----------|--------------------|
| 1 | Do credits expire? | No expiry in v1 |
| 2 | Refund policy for failed runs? | Credit not deducted on `error` — no manual refund needed |
| 3 | Free trial credit on sign-up? | 1 free credit on register (good for conversion) — decide before launch |
| 4 | OAuth providers (Google, GitHub)? | Email/password only in v1; Supabase makes adding OAuth trivial later |
| 5 | SSE direct to Railway — CORS headers needed? | Yes — Railway FastAPI must allow `https://your-app.vercel.app` origin |

---

## 6. Out of Scope (v1)

- Subscription / monthly plans
- API access for programmatic use
- Team / org accounts
- Admin dashboard (use Supabase Table Editor for now)
- Email notifications when analysis completes (Supabase can add this later via triggers)
- Mobile app
