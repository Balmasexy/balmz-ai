BEGIN;

CREATE TABLE IF NOT EXISTS public.balmz_plaid_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  plaid_item_id text NOT NULL REFERENCES public.balmz_plaid_items(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  name text NOT NULL,
  official_name text,
  account_type text,
  account_subtype text,
  mask text,
  currency_code text,
  current_balance numeric(20, 4),
  available_balance numeric(20, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaid_item_id, account_id)
);

CREATE INDEX IF NOT EXISTS balmz_plaid_accounts_user_idx
  ON public.balmz_plaid_accounts (user_id, plaid_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.balmz_plaid_accounts
  TO balmz_ai_app;

INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0010', 'plaid_bank_accounts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
