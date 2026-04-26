# PRD: Open-Source Release + Paid Hosted Platform

**Status:** Draft  
**Author:** nimbusnova  
**Date:** 2026-04-26

---

## 1. Overview

TradingAgents is a multi-agent LLM trading analysis system. This PRD covers two parallel efforts:

1. **Open-Source Release** — publish the repo publicly with no secrets exposed, so developers can self-host with their own API keys.
2. **Paid Hosted Platform** — a cloud-hosted version where users buy report credits and run analyses without any setup. This is the primary revenue model.

**Hosting stack:** Vercel (Next.js frontend) + Render (FastAPI backend) + Supabase (Postgres + Auth).

> **Why not 100% Vercel?** Vercel serverless functions have a max 300-second timeout (Pro tier). A single TradingAgents analysis runs for 3–8 minutes, uses an in-process asyncio queue, and streams SSE responses — none of which fit the serverless model. Vercel handles the frontend perfectly; Render runs the long-lived Python process. Supabase replaces both the SQLite database and all custom auth code.

---

## 2. Goals

| Goal | Success metric |
|------|----------------|
| Repo is safe to make public | `git log --all -S "sk-" --oneline` returns nothing |
| Developers can self-host in < 15 min | README walk-through tested end to end |
| Users can purchase and consume credits | Stripe test-mode checkout → credits appear → run completes → credit deducted |
| Report cache reduces cost and latency | Same ticker + same week returns cached result instantly, 0 credits deducted |
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

The open-source repo is the full analysis engine. Users bring their own LLM API keys and run it themselves. There is no credit system, no auth, no payment, and no report cache — those exist only in the hosted platform.

---

## 4. Part 2 — Paid Hosted Platform

### 4.1 Business model

New users receive **1 free credit** on sign-up. After that, they purchase credit packs. Each completed analysis costs **1 credit**.

| Pack | Price (suggested) | Cost per report |
|------|-------------------|-----------------|
| Free trial | 1 credit on sign-up | — |
| Starter — 5 credits | $9 | $1.80 |
| Value — 10 credits | $15 | $1.50 |
| Pro — 25 credits | $29 | $1.16 |

**LLM cost note:** One analysis at depth=1 using `gpt-5.4-mini` (quick) + `gpt-5.4` (deep) costs roughly $0.30–0.60 in API fees. The host absorbs this; users do not supply their own keys on the hosted platform.

Credits are consumed only when a run reaches `status=done`. Failed or errored runs do **not** deduct a credit.

**Report cache (same-week deduplication):** If a `done` run already exists for the same `ticker` + `analysis_date` within the current ISO week, the new run is fulfilled instantly from the cache — **no credit is deducted**. See §4.6 for the full caching spec.

---

### 4.2 Infrastructure stack

```
Browser
  │
  ├─── HTTPS ──► Vercel  (Next.js 15 App Router)
  │                │
  │                ├── next.config.ts rewrites /api/* ──► Render (FastAPI)
  │                │                                          │
  │                └── Vercel API routes /api/billing/*       │
  │                         │                                 │
  └─── SSE direct ──────────┼────────────────────────────────┘
                             │
                        Supabase
                    (Postgres + Auth + RLS)
```

**Vercel** — serves the Next.js frontend and short-lived billing API routes (< 10 s each).

**Render** — runs the FastAPI backend as a persistent Web Service (not serverless). Handles the analysis queue, LLM calls, and SSE streaming with no timeout constraint. Receives `BACKEND_URL` in Vercel's env so `next.config.ts` rewrites point to it.

**SSE note:** The browser connects to the SSE stream **directly to Render** (`NEXT_PUBLIC_API_URL/api/runs/{id}/stream`), bypassing the Vercel proxy. This avoids Vercel's streaming proxy timeout. All other API calls go through the Vercel rewrite as today.

**Supabase** — managed Postgres, Auth (email/password + Google OAuth), and Row Level Security. Replaces both `web.db` (SQLite) and all custom auth code.

---

### 4.3 Authentication — Supabase Auth

Supabase Auth replaces all custom JWT code. It handles sign-up, login, Google OAuth, password reset, and session cookies out of the box.

**Packages:**
- `@supabase/supabase-js` — Supabase JS client
- `@supabase/ssr` — Next.js App Router helpers (server components + middleware)

**Supported sign-in methods (v1):**
- Email + password
- **Sign in with Google** (Google OAuth via Supabase — enable in Supabase dashboard → Auth → Providers → Google)

**Session flow:**
1. User signs up or continues with Google
2. Supabase sets a secure httpOnly cookie with the session JWT
3. Next.js `middleware.ts` calls `supabase.auth.getUser()` on every request — redirects to `/login` if unauthenticated on protected routes
4. Server components read the session via `createServerClient` from `@supabase/ssr`
5. The FastAPI backend on Render verifies the Supabase JWT using `SUPABASE_JWT_SECRET` — no separate auth system needed

**On first sign-up:** A Supabase Auth hook (or Postgres trigger on `auth.users`) inserts 1 free credit:

```sql
-- Postgres function triggered after auth.users INSERT
CREATE OR REPLACE FUNCTION grant_signup_credit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.credits (user_id, delta, reason)
  VALUES (NEW.id, 1, 'signup_bonus');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION grant_signup_credit();
```

**New auth pages:**
- `app/(auth)/login/page.tsx` — email/password form + "Continue with Google" button
- `app/(auth)/register/page.tsx` — email/password sign-up + "Continue with Google"
- Password reset handled by Supabase's built-in email flow; no custom code needed

---

### 4.4 Database — Supabase Postgres

**Connection:**
- Next.js server components and Vercel API routes: `@supabase/supabase-js` with **anon key** (RLS enforced) or **service role key** (billing webhook only — bypasses RLS)
- FastAPI on Render: connects via `DATABASE_URL` (Supabase connection pooler, `pgbouncer` mode) using `asyncpg`

#### Schema additions

```sql
-- Add user ownership to existing runs table
ALTER TABLE runs ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Credits ledger
CREATE TABLE credits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  delta      INTEGER NOT NULL,   -- +N for purchase/bonus, -1 for run completion
  reason     TEXT,               -- 'signup_bonus' | 'purchase:cs_xxx' | 'run:run-uuid' | 'cache_hit:run-uuid'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Row Level Security policies

```sql
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON runs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credits" ON credits
  FOR SELECT USING (auth.uid() = user_id);
-- Inserts always use service role; no client insert policy needed
```

Credit balance query:
```sql
SELECT COALESCE(SUM(delta), 0) AS balance
FROM credits WHERE user_id = $1;
```

---

### 4.5 Backend changes (FastAPI on Render)

#### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/runs` | Verify Supabase JWT; check credit balance ≥ 1 OR cache hit (§4.6); attach `user_id` |
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

Uses the **service role key** (set as `SUPABASE_SERVICE_ROLE_KEY` on Render) so RLS is bypassed for this write.

#### New dependencies

```
# backend/requirements.txt additions
supabase==2.x     # supabase-py for auth verification + DB writes
asyncpg==0.x      # async Postgres driver (replaces aiosqlite for hosted)
```

---

### 4.6 Report cache — same-week deduplication

To reduce LLM costs and give users instant results for popular tickers, the platform reuses completed reports within the same ISO week.

**Cache key:** `(ticker, ISO week number, ISO year)`

Example: a VST report run on Monday is served to any user requesting VST on Tuesday–Sunday of the same week.

#### Cache lookup in `POST /api/runs`

```python
from datetime import date

def iso_week(d: date):
    return d.isocalendar()[:2]  # (year, week)

# Before queuing a new run:
cached = await db.find_cached_run(
    ticker=req.ticker,
    iso_week=iso_week(date.fromisoformat(req.analysis_date))
)

if cached:
    # Return a lightweight "cache hit" run pointing at the cached result
    # No credit deducted, no LLM work queued
    return CacheHitResponse(cached_run_id=cached.id, ...)
```

New DB query (`db.find_cached_run`):
```sql
SELECT * FROM runs
WHERE ticker = $1
  AND EXTRACT(YEAR  FROM analysis_date::date) = $2
  AND EXTRACT(WEEK  FROM analysis_date::date) = $3
  AND status = 'done'
ORDER BY created_at DESC
LIMIT 1;
```

#### Cache hit response

When a cache hit occurs:
- No new run row is created
- No credit is deducted
- The API returns the existing `run_id` with a `cache_hit: true` flag
- Frontend redirects to `/run/{cached_run_id}` as normal — user sees the full report immediately
- A `reason: "cache_hit:{cached_run_id}"` row is inserted in `credits` with `delta: 0` for audit purposes

#### Cache scope

The cache is **shared across all users** — if any user has already run VST this week, everyone benefits. This maximises savings on popular tickers.

The `analysis_date` chosen by the user still matters: a report requested with `analysis_date=Monday` vs `analysis_date=Friday` uses different market data and is considered a different cache entry (different date, not just different week).

**Cache key is therefore:** `(ticker, analysis_date)` — exact date match, not week-level.

Wait — re-reading the requirement: "reuse the same report if it is within the same week." This means:

> Any `done` run for the same `ticker` created **within the current calendar week** (Mon–Sun) is reused, regardless of the `analysis_date` the user chose.

```sql
-- Cache lookup: same ticker, run created this ISO week, status done
SELECT * FROM runs
WHERE ticker        = $1
  AND status        = 'done'
  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
  AND EXTRACT(WEEK FROM created_at) = EXTRACT(WEEK FROM now())
ORDER BY created_at DESC
LIMIT 1;
```

This means: if anyone ran VST on Monday and it succeeded, all VST requests Tuesday–Sunday of that week get the cached report instantly, regardless of the `analysis_date` the new user picks. The new user sees the cached report's `analysis_date`.

---

### 4.7 Frontend changes (Vercel)

| File | Change |
|------|--------|
| `middleware.ts` | New — `@supabase/ssr` session check; redirect protected routes to `/login` if unauthenticated |
| `Navigation.tsx` | Credit balance chip + "Buy" link when logged in; Login/Register + "Continue with Google" when logged out |
| `RunWizard.tsx` | Skip Provider + Models steps when `NEXT_PUBLIC_HOSTED_MODE=true`; send `Authorization: Bearer` on run creation; handle `cache_hit` response (redirect immediately, show "Instant — from cache" banner) |
| `app/(auth)/login/page.tsx` | New — email/password + Google OAuth button |
| `app/(auth)/register/page.tsx` | New — email/password + Google OAuth button |
| `app/billing/page.tsx` | New — credit pack cards; POST to `/api/billing/checkout`; `?success=1` confirmation |
| `lib/supabase.ts` | New — `createBrowserClient` + `createServerClient` helpers |

---

### 4.8 Billing — Stripe + Vercel API routes

The Stripe integration lives entirely in Vercel API routes (short-lived, no queue needed).

#### New Vercel API routes

| Route | Description |
|-------|-------------|
| `app/api/billing/checkout/route.ts` | Create Stripe Checkout Session with `metadata: { user_id, credits }`; return `{ url }` |
| `app/api/billing/webhook/route.ts` | Verify Stripe signature; on `checkout.session.completed`, insert `delta=+N` into Supabase using service role key |

#### Purchase flow

1. User clicks "Buy 10 credits — $15"
2. `POST /api/billing/checkout` → Stripe Checkout Session → return `{ url }`
3. Browser redirects to Stripe-hosted checkout
4. On success → Stripe fires `checkout.session.completed` → Vercel webhook route inserts `delta=+10`
5. User lands on `/billing?success=1` — balance refreshes immediately via Supabase realtime or re-fetch

---

### 4.9 Hosted model config

On the hosted platform, Provider and Models wizard steps are hidden. Backend uses env-var-configured models:

```bash
HOSTED_MODE=true
HOSTED_PROVIDER=openai
HOSTED_QUICK_MODEL=gpt-5.4-mini
HOSTED_DEEP_MODEL=gpt-5.4
```

The frontend reads `NEXT_PUBLIC_HOSTED_MODE=true` and skips RunWizard steps 3 and 4. Users choose: ticker, date, analysts, depth, language.

---

### 4.10 Environment variables

**Vercel (frontend + billing routes)**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # server-only, never NEXT_PUBLIC_
BACKEND_URL=https://your-api.onrender.com   # FastAPI — used by next.config.ts rewrite
NEXT_PUBLIC_API_URL=https://your-api.onrender.com  # direct SSE connection from browser
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_5=price_xxx
STRIPE_PRICE_10=price_xxx
STRIPE_PRICE_25=price_xxx
NEXT_PUBLIC_HOSTED_MODE=true
```

**Render (FastAPI backend)**

```bash
DATABASE_URL=postgresql://postgres.[ref]:[pw]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # for credit deduction writes
SUPABASE_JWT_SECRET=...                     # Supabase dashboard → Settings → API → JWT Secret
OPENAI_API_KEY=sk-...
HOSTED_MODE=true
HOSTED_PROVIDER=openai
HOSTED_QUICK_MODEL=gpt-5.4-mini
HOSTED_DEEP_MODEL=gpt-5.4
```

---

### 4.11 CORS configuration (Render ↔ Vercel)

The browser opens an SSE `EventSource` directly to Render (bypassing the Vercel proxy). Render's FastAPI must allow the Vercel origin.

**Problem:** Vercel preview deployments have dynamic URLs like `https://tradingagents-abc123-nimbusnova.vercel.app`, so a single static `ALLOWED_ORIGINS` value won't cover them.

**Solution:** Two Render environments (dev + prod) with different `ALLOWED_ORIGINS`:

```bash
# Render dev service
ALLOWED_ORIGINS=https://*.vercel.app

# Render prod service
ALLOWED_ORIGINS=https://your-app.vercel.app
```

FastAPI `CORSMiddleware` supports wildcard patterns when `allow_origin_regex` is used:

```python
from fastapi.middleware.cors import CORSMiddleware
import os

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

| Environment | `ALLOWED_ORIGIN_REGEX` |
|-------------|------------------------|
| Dev (Render) | `https://.*\.vercel\.app` — allows all Vercel preview URLs |
| Prod (Render) | `https://your-app\.vercel\.app` — locked to production only |

**Vercel branch → Render dev mapping:** Create a `dev` branch in the repo. Vercel auto-deploys it at a stable alias like `https://tradingagents-dev.vercel.app`. Set `NEXT_PUBLIC_API_URL` on that Vercel branch to the Render dev service URL. This gives a stable dev URL without the wildcard CORS needed long-term.

---

### 4.12 Deployment steps

1. **Supabase:** Create project → run schema migrations → enable RLS policies → enable Google OAuth (add Client ID + Secret from Google Cloud Console) → verify signup credit trigger
2. **Render (dev):** New Web Service → connect repo → root dir `backend/` → add dev env vars (including `ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app`) → deploy
3. **Render (prod):** Duplicate service → swap to prod env vars (locked CORS origin) → deploy
4. **Vercel:** New project → connect repo → root dir `frontend/` → add env vars → `dev` branch points to Render dev; `main` branch points to Render prod
5. **Stripe:** Create products + prices → copy Price IDs to Vercel prod env → configure webhook to `https://your-app.vercel.app/api/billing/webhook`
6. **Google OAuth:** Add Vercel prod URL + Render dev URL to Google Cloud Console → Authorised JavaScript origins

---

## 5. Decisions locked

| # | Question | Decision |
|---|----------|----------|
| 1 | Credits expire? | **No** |
| 2 | Refund for failed/errored runs? | **No refund needed** — credit not deducted on `error` status |
| 3 | Free trial | **1 credit on sign-up** via Postgres trigger on `auth.users` |
| 4 | Auth methods (v1) | **Email + password** and **Sign in with Google**. Supabase also supports Magic Link, Phone/OTP, GitHub, Apple, Facebook, Twitter/X, Discord, LinkedIn, Azure, Slack, and more — all toggle-on with no code changes. |
| 5 | Report cache scope | **Global** — any `done` run for the same ticker created this ISO week is reused across all users |
| 6 | Force-refresh mid-week | Not in v1; add a "Refresh report (1 credit)" option in a future release |
| 7 | SSE CORS | Dev: wildcard `https://*.vercel.app`; Prod: locked to production domain |

---

## 6. Out of Scope (v1)

- GitHub / Apple OAuth (easy to add via Supabase later)
- Subscription / monthly plans
- API access for programmatic use
- Team / org accounts
- Admin dashboard (use Supabase Table Editor for now)
- Email notifications on analysis completion
- Mobile app
- Force-refresh of cached reports
