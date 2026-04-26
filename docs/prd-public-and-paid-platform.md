# PRD: Open-Source Release + Paid Hosted Platform

**Status:** Draft  
**Author:** nimbusnova  
**Date:** 2026-04-26

---

## 1. Overview

TradingAgents is a multi-agent LLM trading analysis system. This PRD covers two parallel efforts:

1. **Open-Source Release** — publish the repo publicly with no secrets exposed, so developers can self-host with their own API keys.
2. **Paid Hosted Platform** — a cloud-hosted version of the same product where users buy report credits and run analyses without any setup. This is the primary revenue model.

---

## 2. Goals

| Goal | Success metric |
|------|----------------|
| Repo is safe to make public | `git log --all -- .env` returns nothing; no real keys in history |
| Developers can self-host in < 15 min | README walk-through tested end to end |
| Users can purchase and consume credits | Stripe test-mode checkout → credits appear → run completes → credit deducted |
| Revenue from hosted reports | First paying customer within 30 days of launch |

---

## 3. Part 1 — Open-Source Release

### 3.1 Security audit (do before making repo public)

| Item | Current state | Action |
|------|---------------|--------|
| `.env` | Gitignored ✓ | Verify with `git ls-files .env` — confirm not tracked |
| `.env.example` | Has empty values ✓ | No action needed |
| `.env.enterprise.example` | Tracked, empty values ✓ | No action needed |
| LLM clients (`openai_client.py` etc.) | Read keys from `os.environ` ✓ | No action needed |
| `web.db` | At `~/.tradingagents/` (outside repo) ✓ | No action needed |
| Git history | Unknown | Run `git log --all -S "sk-" --oneline` to confirm no keys were ever committed |

### 3.2 Files to add before going public

**`README.md`** (root-level, new file) — covers:
- What it is and a screenshot
- Quick-start (clone → copy `.env.example` → fill in one API key → `./start.sh`)
- Docker Compose path for production
- Link to the hosted version (paid) for users who don't want to self-host

**`LICENSE`** — MIT license (allows free self-hosting, does not restrict commercial use of the hosted platform).

**`.env.example`** — already exists; add a `FINNHUB_API_KEY=` line if it is used and not yet listed, plus a `# Data providers` comment block to group non-LLM keys separately.

### 3.3 What the open-source version does NOT include

The open-source repo is the full analysis engine. Users bring their own API keys and run it themselves. There is no credit system, no auth, no payment in the open-source version — those live only in the hosted platform.

---

## 4. Part 2 — Paid Hosted Platform

### 4.1 Business model

Users purchase **credit packs**. Each completed analysis costs **1 credit**.

| Pack | Price (suggested) | Cost per report |
|------|-------------------|-----------------|
| Starter — 5 credits | $9 | $1.80 |
| Value — 10 credits | $15 | $1.50 |
| Pro — 25 credits | $29 | $1.16 |

**LLM cost note:** A single analysis using `gpt-5.4-mini` (quick) + `gpt-5.4` (deep) at depth=1 costs roughly $0.30–0.60 in API fees. The host absorbs this cost; users do not supply their own keys on the hosted platform.

Credits are consumed only when a run reaches `status=done`. Failed or errored runs do not deduct credits.

### 4.2 User-facing features

#### 4.2.1 Authentication
- Email + password sign-up / login (no OAuth required for v1)
- JWT session stored in an httpOnly cookie
- Password reset via email

#### 4.2.2 Credits dashboard
- Visible credit balance in the nav bar (e.g. `⚡ 7 credits`)
- "Buy more" button links to Stripe Checkout
- Credit history table: date · pack bought or credit spent · run ticker

#### 4.2.3 Run gate
- Before creating a run: API checks the user has ≥ 1 credit
- If 0 credits: return `402 Payment Required` with a redirect URL to the buy page
- Frontend shows a banner: "You're out of credits — [Buy more →]"
- Credit deducted atomically when run status transitions to `done`

#### 4.2.4 Hosted model config
- The "Provider" and "Models" wizard steps are hidden on the hosted platform
- All runs use the host-configured model (e.g. `gpt-5.4-mini` / `gpt-5.4`, OpenAI)
- Users still choose: ticker, date, analysts, depth, language
- This keeps UX simple and cost predictable

### 4.3 Backend changes

#### New tables (SQLite → Postgres for hosted)

```sql
users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT now()
)

credits (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  delta       INTEGER NOT NULL,   -- +10 for purchase, -1 for run
  reason      TEXT,               -- 'purchase:stripe_session_xyz' | 'run:run_id'
  created_at  TIMESTAMP DEFAULT now()
)
```

Credit balance = `SELECT SUM(delta) FROM credits WHERE user_id = ?`

#### New API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Return JWT |
| `POST` | `/api/auth/logout` | Clear cookie |
| `GET`  | `/api/me/credits` | Current balance + recent history |
| `POST` | `/api/billing/checkout` | Create Stripe Checkout session, return URL |
| `POST` | `/api/billing/webhook` | Stripe webhook — fulfill credits on payment |

#### Modified endpoints

- `POST /api/runs` — require auth header; check balance ≥ 1 before queuing
- Run completion hook in `run_queue.py` — insert `delta=-1` credit row when status → `done`

### 4.4 Frontend changes

| Component | Change |
|-----------|--------|
| `Navigation.tsx` | Add credit balance chip + "Buy" link when logged in; Login/Sign-up links when logged out |
| `RunWizard.tsx` | On hosted platform, skip Provider + Models steps; use server-configured defaults |
| `app/login/page.tsx` | New — email/password login form |
| `app/register/page.tsx` | New — sign-up form |
| `app/billing/page.tsx` | New — credit packs grid + Stripe Checkout redirect |
| `middleware.ts` | Protect `/run/new` and `/run/[id]` routes; redirect to login if unauthenticated |

### 4.5 Payment flow (Stripe)

1. User clicks "Buy 10 credits — $15"
2. Frontend calls `POST /api/billing/checkout` → backend creates a Stripe Checkout session with `metadata: { user_id, credits: 10 }`
3. User is redirected to Stripe-hosted checkout page
4. On success, Stripe fires `checkout.session.completed` webhook
5. Backend verifies signature, inserts `delta=+10` credits row
6. User is redirected to `/billing?success=1` — balance updates immediately

### 4.6 Environment variables (hosted only)

```bash
# Hosted platform additions (not in open-source .env.example)
DATABASE_URL=postgresql://...       # upgrade from SQLite for multi-user
JWT_SECRET=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_5=price_xxx            # Stripe Price IDs for each pack
STRIPE_PRICE_10=price_xxx
STRIPE_PRICE_25=price_xxx
HOSTED_MODE=true                    # hides Provider/Models steps in UI
```

### 4.7 Deployment architecture (hosted)

```
Cloudflare (DNS + DDoS)
    │
    ▼
VPS / Fly.io / Railway
    ├── Next.js frontend (port 3000)
    ├── FastAPI backend  (port 8001)
    └── Postgres         (port 5432)
```

Single `docker-compose.prod.yml` with Postgres replacing SQLite. Backend connects via `DATABASE_URL`. Secrets injected as environment variables (never in repo).

---

## 5. Open Questions

| # | Question | Default assumption |
|---|----------|--------------------|
| 1 | Do hosted users pick their own models, or does host fix the model? | Host fixes model (simpler, cost-controlled) |
| 2 | Do credits expire? | No expiry in v1 |
| 3 | Refund policy for failed runs? | Credit not deducted on `error` — no refund needed |
| 4 | Free tier? | No free tier in v1; consider 1 free credit on sign-up for conversion |
| 5 | Which VPS/platform to host on? | TBD by operator |
| 6 | Migrate to Postgres or keep SQLite? | Postgres recommended for multi-user; SQLite fine for < 100 concurrent users |

---

## 6. Out of Scope (v1)

- OAuth / social login
- Subscription / monthly plans
- API access for programmatic use
- Team/org accounts
- Admin dashboard (can use direct DB queries for now)
- Email notifications when analysis completes
