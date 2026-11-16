BEGIN;

ALTER TABLE public.balmz_service_credentials
  DROP CONSTRAINT IF EXISTS balmz_service_credentials_service_id_check;

ALTER TABLE public.balmz_service_credentials
  ADD CONSTRAINT balmz_service_credentials_service_id_check
  CHECK (service_id IN (
    'paystack', 'plaid', 'money-movement', 'coingecko', 'chartgpt', 'github',
    'render', 'neon', 'notion', 'agentic-ai', 'notes-ai', 'custom'
  ));

CREATE TABLE IF NOT EXISTS public.balmz_money_movement_customers (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  customer_url text NOT NULL UNIQUE,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  customer_type text NOT NULL CHECK (customer_type IN ('unverified', 'personal', 'business', 'receive-only')),
  provider_status text NOT NULL DEFAULT 'pending',
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.balmz_plaid_items (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE,
  encrypted_access_token text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  institution_id text,
  institution_name text NOT NULL,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_login', 'disconnected', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz
);

CREATE INDEX IF NOT EXISTS balmz_plaid_items_user_created_idx
  ON public.balmz_plaid_items (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_money_movement_funding_sources (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES public.balmz_money_movement_customers(id) ON DELETE CASCADE,
  plaid_item_id text REFERENCES public.balmz_plaid_items(id) ON DELETE SET NULL,
  funding_source_url text NOT NULL UNIQUE,
  name text NOT NULL,
  institution_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('checking', 'savings')),
  account_mask text,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  provider_status text NOT NULL DEFAULT 'pending'
    CHECK (provider_status IN ('pending', 'verified', 'unverified', 'removed', 'failed')),
  ach_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE INDEX IF NOT EXISTS balmz_money_movement_funding_user_idx
  ON public.balmz_money_movement_funding_sources (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.balmz_money_movement_customers,
             public.balmz_plaid_items,
             public.balmz_money_movement_funding_sources
  TO balmz_ai_app;

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0009', 'plaid_nmi_money_movement')
ON CONFLICT (version) DO NOTHING;

COMMIT;
