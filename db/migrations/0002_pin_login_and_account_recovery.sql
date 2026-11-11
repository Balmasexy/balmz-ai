BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_auth_pins (
  user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.balmz_auth_recovery (
  user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  code_verified_at timestamptz,
  pin_verified_at timestamptz,
  reset_token_hash char(64),
  reset_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((pin_verified_at IS NULL) OR (code_verified_at IS NOT NULL)),
  CHECK ((reset_token_hash IS NULL) = (reset_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS balmz_auth_recovery_expires_idx
  ON public.balmz_auth_recovery (expires_at);

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0002', 'pin_login_and_account_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
