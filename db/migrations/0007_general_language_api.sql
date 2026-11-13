BEGIN;

ALTER TABLE public.balmz_ai_provider_connections
  ADD COLUMN IF NOT EXISTS endpoint_url text;

ALTER TABLE public.balmz_ai_provider_connections
  DROP CONSTRAINT IF EXISTS balmz_ai_provider_connections_provider_id_check;

ALTER TABLE public.balmz_ai_provider_connections
  ADD CONSTRAINT balmz_ai_provider_connections_provider_id_check
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
    'fireworks',
    'general'
  ));

ALTER TABLE public.balmz_ai_provider_connections
  DROP CONSTRAINT IF EXISTS balmz_ai_provider_connections_general_endpoint_required;

ALTER TABLE public.balmz_ai_provider_connections
  ADD CONSTRAINT balmz_ai_provider_connections_general_endpoint_required
  CHECK (provider_id <> 'general' OR (endpoint_url IS NOT NULL AND btrim(endpoint_url) <> ''));

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0007', 'general_language_api')
ON CONFLICT (version) DO NOTHING;

COMMIT;
