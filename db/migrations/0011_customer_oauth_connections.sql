BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_customer_oauth_states (
  state_hash char(64) PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  provider_id text NOT NULL CHECK (provider_id IN (
    'google', 'microsoft', 'slack', 'dropbox', 'box', 'github', 'gitlab', 'notion'
  )),
  encrypted_code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balmz_customer_oauth_states_owner_expiry_idx
  ON public.balmz_customer_oauth_states (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_customer_oauth_connections (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  provider_id text NOT NULL CHECK (provider_id IN (
    'google', 'microsoft', 'slack', 'dropbox', 'box', 'github', 'gitlab', 'notion'
  )),
  provider_account_id text NOT NULL,
  display_name text NOT NULL,
  email text,
  encrypted_tokens text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'reconnect_required', 'disconnected')),
  last_verified_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (user_id, provider_id, provider_account_id)
);

CREATE INDEX IF NOT EXISTS balmz_customer_oauth_connections_owner_idx
  ON public.balmz_customer_oauth_connections (user_id, provider_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.balmz_customer_oauth_states,
             public.balmz_customer_oauth_connections
  TO balmz_ai_app;

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0011', 'customer_oauth_connections')
ON CONFLICT (version) DO NOTHING;

COMMIT;
