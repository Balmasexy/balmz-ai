BEGIN;
CREATE TABLE IF NOT EXISTS public.balmz_trial_redemptions (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  subscription_id text NOT NULL UNIQUE REFERENCES public.balmz_subscriptions(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS balmz_trial_redemptions_redeemed_idx ON public.balmz_trial_redemptions (redeemed_at DESC);
INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0006', 'one_time_pro_trial_redemptions')
ON CONFLICT (version) DO NOTHING;
COMMIT;