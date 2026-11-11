BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_service_credentials (
  id text PRIMARY KEY,
  service_id text NOT NULL
    CHECK (service_id IN ('paystack', 'coingecko', 'custom', 'notes-ai')),
  display_name text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  encrypted_credentials text NOT NULL,
  status text NOT NULL DEFAULT 'untested'
    CHECK (status IN ('untested', 'connected', 'failed')),
  last_tested_at timestamptz,
  last_error_code text,
  created_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, environment, display_name)
);

CREATE INDEX IF NOT EXISTS balmz_service_credentials_lookup_idx
  ON public.balmz_service_credentials (service_id, environment, status);

CREATE TABLE IF NOT EXISTS public.balmz_api_keys (
  id text PRIMARY KEY,
  name text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo', 'live')),
  key_prefix text NOT NULL UNIQUE,
  key_hash char(64) NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balmz_api_keys_admin_list_idx
  ON public.balmz_api_keys (status, environment, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_notes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balmz_notes_user_updated_idx
  ON public.balmz_notes (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_payment_environment (
  environment text PRIMARY KEY CHECK (environment IN ('demo', 'live')),
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  enabled_at timestamptz,
  enabled_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.balmz_payment_environment (environment, enabled)
VALUES ('demo', false), ('live', false)
ON CONFLICT (environment) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.balmz_schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0003', 'api_keys_integrations_and_payment_environments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
