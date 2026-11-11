BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_checkout_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  plan_id text NOT NULL REFERENCES public.balmz_subscription_plans(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider = 'paystack'),
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  reference text NOT NULL UNIQUE,
  provider_reference text UNIQUE,
  expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0),
  currency char(3) NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year', 'one_time')),
  entitlements_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'expired')),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balmz_checkout_attempts_user_created_idx
  ON public.balmz_checkout_attempts (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS balmz_checkout_attempts_one_pending_per_user_idx
  ON public.balmz_checkout_attempts (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS balmz_checkout_attempts_status_expiry_idx
  ON public.balmz_checkout_attempts (status, expires_at);

CREATE TABLE IF NOT EXISTS public.balmz_schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0004', 'paystack_checkout_attempts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
