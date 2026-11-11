BEGIN;

CREATE TABLE IF NOT EXISTS public."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'support')),
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."session" (
  id text PRIMARY KEY,
  "expiresAt" timestamp without time zone NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON public."session" ("userId");

CREATE TABLE IF NOT EXISTS public."account" (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp without time zone,
  "refreshTokenExpiresAt" timestamp without time zone,
  scope text,
  password text,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_provider_identity_unique UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON public."account" ("userId");

CREATE TABLE IF NOT EXISTS public."verification" (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamp without time zone NOT NULL,
  "createdAt" timestamp without time zone DEFAULT now(),
  "updatedAt" timestamp without time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON public."verification" (identifier);

CREATE TABLE IF NOT EXISTS public.balmz_subscription_plans (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  currency char(3),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year', 'one_time')),
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.balmz_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.balmz_subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')),
  billing_provider text CHECK (billing_provider IS NULL OR billing_provider IN ('paystack', 'admin')),
  provider_customer_reference text,
  provider_subscription_reference text,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS balmz_subscriptions_user_created_idx
  ON public.balmz_subscriptions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS balmz_one_current_subscription_per_user_idx
  ON public.balmz_subscriptions (user_id)
  WHERE status IN ('trialing', 'active', 'past_due');

CREATE TABLE IF NOT EXISTS public.balmz_payment_records (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  subscription_id text REFERENCES public.balmz_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('paystack')),
  provider_reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'reversed')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS balmz_payment_records_user_created_idx
  ON public.balmz_payment_records (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_billing_webhook_events (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('paystack')),
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload_sha256 char(64) NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text
);

CREATE TABLE IF NOT EXISTS public.balmz_usage_counters (
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  units_used bigint NOT NULL DEFAULT 0 CHECK (units_used >= 0),
  units_limit bigint CHECK (units_limit IS NULL OR units_limit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, metric, period_start),
  CHECK (period_end > period_start)
);

CREATE TABLE IF NOT EXISTS public.balmz_usage_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  metric text NOT NULL,
  units bigint NOT NULL CHECK (units > 0),
  source text NOT NULL,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balmz_usage_events_idempotency_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS balmz_usage_events_user_created_idx
  ON public.balmz_usage_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_admin_audit_log (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS balmz_admin_audit_actor_created_idx
  ON public.balmz_admin_audit_log (actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0001', 'identity_and_subscription_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
