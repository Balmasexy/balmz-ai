BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_customer_mcp_connections (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  endpoint_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none'
    CHECK (auth_type IN ('none', 'bearer')),
  encrypted_credentials text,
  status text NOT NULL DEFAULT 'untested'
    CHECK (status IN ('untested', 'connected', 'failed', 'disconnected')),
  server_name text,
  server_version text,
  discovered_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_tested_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (user_id, display_name)
);

CREATE INDEX IF NOT EXISTS balmz_customer_mcp_connections_owner_idx
  ON public.balmz_customer_mcp_connections (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_customer_mcp_tool_events (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES public.balmz_customer_mcp_connections(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  tool_name text NOT NULL,
  arguments_sha256 char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('approval_required', 'approved', 'succeeded', 'failed', 'denied')),
  approval_required boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balmz_customer_mcp_tool_events_owner_idx
  ON public.balmz_customer_mcp_tool_events (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.balmz_customer_mcp_connections,
             public.balmz_customer_mcp_tool_events
  TO balmz_ai_app;

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0012', 'customer_remote_mcp_connections')
ON CONFLICT (version) DO NOTHING;

COMMIT;
