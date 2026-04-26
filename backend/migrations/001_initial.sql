-- ============================================================
-- TradingAgents hosted platform — initial Supabase schema
-- Run once in Supabase dashboard → SQL Editor
-- ============================================================

-- ── stripe_customers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id  TEXT NOT NULL UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own record" ON public.stripe_customers
    USING (auth.uid() = user_id);

-- ── runs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.runs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES auth.users(id),
    cache_source_run_id  UUID REFERENCES public.runs(id),
    ticker               TEXT NOT NULL,
    trade_date           DATE NOT NULL,
    config               JSONB NOT NULL DEFAULT '{}',
    status               TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','running','done','error')),
    decision             TEXT CHECK (decision IN ('BUY','OVERWEIGHT','HOLD','UNDERWEIGHT','SELL')),
    llm_provider         TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at          TIMESTAMPTZ
);

CREATE INDEX runs_user_id_idx      ON public.runs (user_id, created_at DESC);
CREATE INDEX runs_cache_lookup_idx ON public.runs (ticker, status, created_at DESC);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.runs
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── report_sections ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_sections (
    run_id   UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    section  TEXT NOT NULL,
    content  TEXT,
    PRIMARY KEY (run_id, section)
);

CREATE INDEX report_sections_run_id_idx ON public.report_sections (run_id);

ALTER TABLE public.report_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "via run ownership" ON public.report_sections
    USING (
        EXISTS (
            SELECT 1 FROM public.runs
            WHERE runs.id = report_sections.run_id
              AND runs.user_id = auth.uid()
        )
    );

-- ── run_events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id      UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    event_json  JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX run_events_run_id_idx ON public.run_events (run_id, id ASC);

ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "via run ownership" ON public.run_events
    USING (
        EXISTS (
            SELECT 1 FROM public.runs
            WHERE runs.id = run_events.run_id
              AND runs.user_id = auth.uid()
        )
    );

-- ── credits ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credits (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id),
    delta             INTEGER NOT NULL,
    reason            TEXT NOT NULL
                          CHECK (reason IN ('signup_bonus','purchase','run_charge','cache_hit','admin_adjustment')),
    run_id            UUID REFERENCES public.runs(id),
    stripe_session_id TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent charging the same run twice
CREATE UNIQUE INDEX credits_run_charge_once
    ON public.credits (run_id)
    WHERE reason = 'run_charge';

-- Prevent fulfilling the same Stripe session twice
CREATE UNIQUE INDEX credits_stripe_session_once
    ON public.credits (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;

CREATE INDEX credits_user_id_idx ON public.credits (user_id, created_at DESC);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credits" ON public.credits
    FOR SELECT USING (auth.uid() = user_id);
-- All inserts use service role (bypasses RLS)

-- ── trading_memory ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trading_memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID UNIQUE REFERENCES public.runs(id),
    ticker      TEXT NOT NULL,
    trade_date  DATE NOT NULL,
    rating      TEXT,
    decision    TEXT,
    reflection  TEXT,
    raw         TEXT,
    alpha       TEXT,
    holding     TEXT,
    pending     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trading_memory_ticker_idx ON public.trading_memory (ticker, created_at DESC);
-- No RLS — global read, service-role writes only

-- ── signup credit trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_signup_credit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        INSERT INTO public.credits (user_id, delta, reason)
        VALUES (NEW.id, 1, 'signup_bonus');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_email_confirmed
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.grant_signup_credit();
