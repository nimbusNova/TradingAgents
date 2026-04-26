# Deployment Setup Guide

**Stack:** Supabase (DB + Auth) → Render (FastAPI backend) → Vercel (Next.js frontend) → Stripe (billing)

**Order matters.** Do Supabase first — you need its credentials before configuring Render and Vercel. Do Render before Vercel — you need the Render URL for CORS and the frontend env vars. Set up Stripe last once both services are live.

---

## 1. Supabase

### 1.1 Create project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Fill in project name, database password (save this), and region closest to your Render region
3. Wait ~2 minutes for the project to provision

### 1.2 Run the database migration

1. In the Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Paste the entire contents of `backend/migrations/001_initial.sql`
4. Click **Run**

This creates all 7 tables, RLS policies, indexes, and the signup-credit trigger.

### 1.3 Enable Google OAuth

1. Go to **Authentication → Providers → Google**
2. Toggle **Enable Google provider**
3. You'll need a Google OAuth app — go to [console.cloud.google.com](https://console.cloud.google.com):
   - Create a project (or use existing)
   - **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**
4. Back in Supabase, paste the Client ID and Client Secret → **Save**

### 1.4 Add your Vercel domain to allowed redirect URLs

1. Go to **Authentication → URL Configuration**
2. Under **Redirect URLs**, add:
   - `https://<your-vercel-app>.vercel.app/**`
   - `http://localhost:3001/**` (for local dev)
3. Set **Site URL** to `https://<your-vercel-app>.vercel.app` (update after Vercel deploy)

### 1.5 Collect credentials

Go to **Settings → API** and copy:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → **anon / public** |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → **service_role** (keep secret) |
| `SUPABASE_JWT_SECRET` | Settings → API → **JWT Settings** → JWT Secret |

Go to **Settings → Database → Connection string → URI** and copy:

| Variable | Where to find it |
|----------|-----------------|
| `DATABASE_URL` | Use the **pgbouncer** (pooler) connection string — port 6543 |

The pooler URL looks like:
```
postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Replace `[password]` with the database password you set in step 1.1.

---

## 2. Render

### 2.1 Create Web Service

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repository
3. Configure the service:
   - **Name:** `tradingagents-backend` (or your choice)
   - **Region:** Same region as your Supabase project
   - **Branch:** `main`
   - **Runtime:** **Docker**
   - **Dockerfile path:** `Dockerfile.backend`
   - **Docker context:** leave blank (uses repo root)

### 2.2 Set environment variables

In the **Environment** tab, add every variable from `backend/.env.example`:

```
# LLM provider — add whichever you use
OPENAI_API_KEY=sk-...

# CORS — set to your Vercel URL (update after Vercel deploy)
ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app

# Hosted mode
USE_ACTUAL_DB=true

# Supabase
DATABASE_URL=postgresql://postgres.[ref]:[pw]@...pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...
```

> **Note:** Do not add a `.env` file. Set all vars directly in the Render dashboard.

### 2.3 Deploy

1. Click **Create Web Service**
2. Render will pull the repo, build `Dockerfile.backend` with the repo root as context, and deploy
3. Wait for the first deploy to succeed (takes ~5 min due to the large ML dependencies)
4. Copy your service URL — it looks like `https://tradingagents-backend.onrender.com`

### 2.4 Update ALLOWED_ORIGINS

Once you have your Vercel URL (after step 3), come back and update `ALLOWED_ORIGINS`:

```
ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app,https://<custom-domain>.com
```

Render will redeploy automatically.

---

## 3. Vercel

### 3.1 Create project

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import your GitHub repository
3. Set **Root Directory** to `frontend`
4. Framework will be auto-detected as **Next.js**

### 3.2 Set environment variables

Add every variable from `frontend/.env.example`:

```
# Backend — your Render service URL
BACKEND_URL=https://tradingagents-backend.onrender.com
NEXT_PUBLIC_API_URL=https://tradingagents-backend.onrender.com

# Hosted mode
NEXT_PUBLIC_HOSTED_MODE=true

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (add after completing step 4)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_5=price_...
STRIPE_PRICE_10=price_...
STRIPE_PRICE_25=price_...
```

> **Important:** `NEXT_PUBLIC_*` variables are baked in at build time. Set them before the first deploy.

### 3.3 Deploy

1. Click **Deploy**
2. Vercel builds the Next.js app and deploys to `https://<your-app>.vercel.app`

### 3.4 Configure environment names (recommended)

Vercel supports **Production**, **Preview**, and **Development** environments. Set:

- `NEXT_PUBLIC_HOSTED_MODE=true` → **Production only**
- `ALLOWED_ORIGINS` on Render → add the Vercel preview domain too (e.g. `https://<your-app>-*.vercel.app`) so preview deploys work

### 3.5 Update Supabase redirect URLs

Now that you have your Vercel URL:
1. Go back to Supabase → **Authentication → URL Configuration**
2. Update **Site URL** to `https://<your-app>.vercel.app`
3. Confirm `https://<your-app>.vercel.app/**` is in Redirect URLs

---

## 4. Stripe

### 4.1 Create account and products

1. Go to [stripe.com](https://stripe.com) and create an account
2. Go to **Products → Add product** — create three products:

| Product | Price | Type |
|---------|-------|------|
| 5 Analysis Credits | $9.00 | One-time |
| 10 Analysis Credits | $15.00 | One-time |
| 25 Analysis Credits | $29.00 | One-time |

3. After creating each product, copy the **Price ID** (starts with `price_`)

### 4.2 Get API keys

Go to **Developers → API keys**:
- Copy **Publishable key** (not needed in env, but save it)
- Copy **Secret key** → `STRIPE_SECRET_KEY`

### 4.3 Set up webhook

1. Go to **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://<your-vercel-app>.vercel.app/api/billing/webhook`
3. Events to listen to: **checkout.session.completed**
4. Click **Add endpoint**
5. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 4.4 Update Vercel environment variables

Go back to Vercel → your project → **Settings → Environment Variables** and add:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_5=price_xxx   # 5-credit pack price ID
STRIPE_PRICE_10=price_xxx  # 10-credit pack price ID
STRIPE_PRICE_25=price_xxx  # 25-credit pack price ID
```

Trigger a redeploy: **Deployments → ⋯ → Redeploy**.

---

## 5. Verify end-to-end

Run through this checklist after everything is deployed:

- [ ] **Homepage loads** at your Vercel URL with no console errors
- [ ] **Register** with email → check inbox for confirmation email → click link → 1 credit appears in nav
- [ ] **Google OAuth** — click "Continue with Google" → redirected back → logged in
- [ ] **Auth gate** — log out → try `/run/new` → redirected to `/login`
- [ ] **Run analysis** — log in → start a run → credit decrements on completion
- [ ] **0 credits** — try starting another run → "out of credits" banner appears
- [ ] **Stripe checkout** — click Buy → complete test payment (`4242 4242 4242 4242`) → balance increases
- [ ] **Cache hit** — run same ticker again within the same week → instant result

---

## 6. Custom domain (optional)

**Vercel:**
1. Project → **Settings → Domains → Add**
2. Add your domain and follow the DNS instructions

**After adding domain:**
- Update Supabase **Site URL** and **Redirect URLs** to your custom domain
- Update `ALLOWED_ORIGINS` on Render to include your custom domain
- Trigger Vercel redeploy if `NEXT_PUBLIC_SUPABASE_URL` references changed

---

## Quick reference — all environment variables

### Render (backend)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | (or whichever LLM provider) |
| `USE_ACTUAL_DB` | `true` |
| `DATABASE_URL` | Supabase pgbouncer pooler URI |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification |
| `ALLOWED_ORIGINS` | Comma-separated Vercel URL(s) |

### Vercel (frontend)

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Render service URL (server-side) |
| `NEXT_PUBLIC_API_URL` | Render service URL (client-side SSE) |
| `NEXT_PUBLIC_HOSTED_MODE` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (webhook route) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_5` | Price ID for 5-credit pack |
| `STRIPE_PRICE_10` | Price ID for 10-credit pack |
| `STRIPE_PRICE_25` | Price ID for 25-credit pack |
