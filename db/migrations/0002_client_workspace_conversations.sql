BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_conversations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balmz_conversations_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT balmz_conversations_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS balmz_conversations_user_updated_idx
  ON public.balmz_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.balmz_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100000),
  provider_response_id text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balmz_messages_conversation_owner_fk
    FOREIGN KEY (conversation_id, user_id)
    REFERENCES public.balmz_conversations (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS balmz_messages_conversation_created_idx
  ON public.balmz_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS balmz_messages_user_role_created_idx
  ON public.balmz_messages (user_id, role, created_at DESC);

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0002', 'client_workspace_conversations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
