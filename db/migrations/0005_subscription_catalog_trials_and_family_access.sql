BEGIN;
CREATE TABLE IF NOT EXISTS public.balmz_complimentary_access_grants (
  id text PRIMARY KEY,
  grant_batch_id text NOT NULL,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  granted_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  grant_type text NOT NULL DEFAULT 'family' CHECK (grant_type IN ('family', 'complimentary')),
  duration text NOT NULL CHECK (duration IN ('week', '1_month', '3_months', '6_months', '9_months', '1_year', 'lifetime')),
  prompt_tag text NOT NULL CHECK (length(prompt_tag) BETWEEN 1 AND 80),
  shared_prompt text NOT NULL CHECK (length(shared_prompt) BETWEEN 1 AND 4000),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS balmz_one_unrevoked_complimentary_grant_per_user_idx ON public.balmz_complimentary_access_grants (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS balmz_complimentary_grants_batch_idx ON public.balmz_complimentary_access_grants (grant_batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS balmz_complimentary_grants_active_idx ON public.balmz_complimentary_access_grants (user_id, starts_at, expires_at) WHERE revoked_at IS NULL;
INSERT INTO public.balmz_subscription_plans
  (id, code, display_name, description, currency, price_minor, billing_interval, entitlements, is_public, is_enabled)
VALUES
  ('plan-free', 'free', 'Free', 'Free BALMZ AI access with 50 AI messages each UTC calendar month.', 'NGN', 0, 'one_time', '{"limits":{"ai_messages":50},"features":["basic_workplace"]}'::jsonb, true, true),
  ('plan-pro-monthly', 'pro_monthly', 'Pro Monthly', 'Affordable Pro access with 500 AI messages per UTC calendar month. One-time monthly term; automatic recurring billing is not enabled.', 'NGN', 349900, 'month', '{"limits":{"ai_messages":500},"features":["pro_workplace","connected_ai_providers"]}'::jsonb, true, true),
  ('plan-pro-yearly', 'pro_yearly', 'Pro Yearly', 'Affordable annual Pro access with 500 AI messages per UTC calendar month. One-time annual term; automatic recurring billing is not enabled.', 'NGN', 3499000, 'year', '{"limits":{"ai_messages":500},"features":["pro_workplace","connected_ai_providers"]}'::jsonb, true, true),
  ('plan-pro-trial', 'pro_trial', 'Pro 7-Day Trial', 'Seven-day Pro trial which reverts to Free when the trial ends.', 'NGN', 0, 'one_time', '{"limits":{"ai_messages":500},"trial_days":7,"features":["pro_workplace","connected_ai_providers"]}'::jsonb, false, true),
  ('plan-family-complimentary', 'family_complimentary', 'Family Complimentary', 'Admin-assigned complimentary access for selected registered members with a shared prompt.', 'NGN', 0, 'one_time', '{"limits":{"ai_messages":500},"features":["family_access","shared_admin_prompt","connected_ai_providers"]}'::jsonb, false, true)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  currency = EXCLUDED.currency,
  price_minor = EXCLUDED.price_minor,
  billing_interval = EXCLUDED.billing_interval,
  entitlements = EXCLUDED.entitlements,
  is_public = EXCLUDED.is_public,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();
INSERT INTO public.balmz_subscriptions
  (id, user_id, plan_id, status, billing_provider, current_period_starts_at, current_period_ends_at)
SELECT 'free-' || u.id, u.id, 'plan-free', 'active', 'admin', now(), NULL
FROM public."user" u
WHERE NOT EXISTS (
  SELECT 1 FROM public.balmz_subscriptions s
  WHERE s.user_id = u.id AND s.status IN ('active', 'trialing', 'past_due')
    AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.balmz_schema_migrations (version, name)
VALUES ('0005', 'subscription_catalog_trials_and_family_access')
ON CONFLICT (version) DO NOTHING;
COMMIT;