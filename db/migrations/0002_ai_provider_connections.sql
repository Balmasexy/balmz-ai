BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_ai_provider_connections (
  id text PRIMARY KEY,
  provider_id text NOT NULL
    CHECK (provider_id IN (
      'openai',
      'anthropic',
      'google',
      'xai',
      'openrouter',
      'deepseek',
      'groq',
      'mistral',
      'together',
      'fireworks'
    )),
  display_name text NOT NULL,
  model_id text NOT NULL,
  encrypted_api_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_test_status text NOT NULL DEFAULT 'untested'
    CHECK (last_test_status IN ('untested', 'connected', 'failed')),
  last_tested_at timestamptz,
  last_error_code text,
  created_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, display_name)
);

CREATE INDEX IF NOT EXISTS balmz_ai_provider_connections_enabled_idx
  ON public.balmz_ai_provider_connections (enabled, provider_id, display_name);

CREATE TABLE IF NOT EXISTS public.balmz_schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0002', 'ai_provider_connections')
ON CONFLICT (version) DO NOTHING;

COMMIT;
