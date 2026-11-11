import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export type CountValue = number | string;

export type AdminOverview = {
  totals: {
    users: CountValue;
    admins: CountValue;
    verified_users: CountValue;
    active_subscriptions: CountValue;
    successful_payments: CountValue;
    payment_records: CountValue;
    pending_payments: CountValue;
    usage_events: CountValue;
    pending_webhooks: CountValue;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    emailVerified: boolean;
    createdAt: string | Date;
  }>;
  plans: Array<{
    id: string;
    code: string;
    display_name: string;
    description: string | null;
    currency: string | null;
    price_minor: CountValue | null;
    billing_interval: string | null;
    is_public: boolean;
    is_enabled: boolean;
    created_at: string | Date;
  }>;
  subscriptions: Array<{
    id: string;
    user_name: string;
    email: string;
    plan_name: string;
    status: string;
    billing_provider: string | null;
    current_period_ends_at: string | Date | null;
    created_at: string | Date;
  }>;
  payments: Array<{
    id: string;
    email: string;
    provider: string;
    provider_reference: string;
    amount_minor: CountValue;
    currency: string;
    status: string;
    verified_at: string | Date | null;
    created_at: string | Date;
  }>;
  usage: Array<{
    user_id: string;
    email: string;
    metric: string;
    units_used: CountValue;
    units_limit: CountValue | null;
    period_start: string | Date;
    period_end: string | Date;
    updated_at: string | Date;
  }>;
  webhooks: Array<{
    id: string;
    provider: string;
    provider_event_id: string;
    event_type: string;
    processing_status: string;
    received_at: string | Date;
    processed_at: string | Date | null;
    error_code: string | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown>;
    created_at: string | Date;
    actor_email: string | null;
    target_email: string | null;
  }>;
};

export async function isAdminUser(userId: string): Promise<boolean> {
  const result = await getDbPool().query<{ role: string }>(
    `SELECT role FROM public."user" WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.role === "admin";
}

export async function getAdminSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!(await isAdminUser(session.user.id))) return null;
  return session;
}

/** All dashboard values are read from the live BALMZ AI Neon database. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const pool = getDbPool();
  const [users, plans, subscriptions, payments, usage, webhooks, audit, totals] =
    await Promise.all([
      pool.query<AdminOverview["users"][number]>(
        `SELECT id, name, email, role, "emailVerified", "createdAt"
         FROM public."user" ORDER BY "createdAt" DESC LIMIT 50`,
      ),
      pool.query<AdminOverview["plans"][number]>(
        `SELECT id, code, display_name, description, currency, price_minor,
                billing_interval, is_public, is_enabled, created_at
         FROM public.balmz_subscription_plans
         ORDER BY created_at DESC LIMIT 25`,
      ),
      pool.query<AdminOverview["subscriptions"][number]>(
        `SELECT s.id, u.name AS user_name, u.email, p.display_name AS plan_name,
                s.status, s.billing_provider, s.current_period_ends_at, s.created_at
         FROM public.balmz_subscriptions s
         JOIN public."user" u ON u.id = s.user_id
         JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
         ORDER BY s.created_at DESC LIMIT 50`,
      ),
      pool.query<AdminOverview["payments"][number]>(
        `SELECT p.id, u.email, p.provider, p.provider_reference, p.amount_minor,
                p.currency, p.status, p.verified_at, p.created_at
         FROM public.balmz_payment_records p
         JOIN public."user" u ON u.id = p.user_id
         ORDER BY p.created_at DESC LIMIT 50`,
      ),
      pool.query<AdminOverview["usage"][number]>(
        `SELECT c.user_id, u.email, c.metric, c.units_used, c.units_limit,
                c.period_start, c.period_end, c.updated_at
         FROM public.balmz_usage_counters c
         JOIN public."user" u ON u.id = c.user_id
         ORDER BY c.updated_at DESC LIMIT 50`,
      ),
      pool.query<AdminOverview["webhooks"][number]>(
        `SELECT id, provider, provider_event_id, event_type, processing_status,
                received_at, processed_at, error_code
         FROM public.balmz_billing_webhook_events
         ORDER BY received_at DESC LIMIT 25`,
      ),
      pool.query<AdminOverview["audit"][number]>(
        `SELECT a.id, a.action, a.metadata, a.created_at,
                actor.email AS actor_email, target.email AS target_email
         FROM public.balmz_admin_audit_log a
         LEFT JOIN public."user" actor ON actor.id = a.actor_user_id
         LEFT JOIN public."user" target ON target.id = a.target_user_id
         ORDER BY a.created_at DESC LIMIT 50`,
      ),
      pool.query<AdminOverview["totals"]>(
        `SELECT
           (SELECT count(*)::int FROM public."user") AS users,
           (SELECT count(*)::int FROM public."user" WHERE role = 'admin') AS admins,
           (SELECT count(*)::int FROM public."user" WHERE "emailVerified" = true) AS verified_users,
           (SELECT count(*)::int FROM public.balmz_subscriptions WHERE status IN ('active','trialing')) AS active_subscriptions,
           (SELECT count(*)::int FROM public.balmz_payment_records WHERE status = 'success') AS successful_payments,
           (SELECT count(*)::int FROM public.balmz_payment_records) AS payment_records,
           (SELECT count(*)::int FROM public.balmz_payment_records WHERE status = 'pending') AS pending_payments,
           (SELECT count(*)::int FROM public.balmz_usage_events) AS usage_events,
           (SELECT count(*)::int FROM public.balmz_billing_webhook_events WHERE processing_status IN ('received','failed')) AS pending_webhooks`,
      ),
    ]);

  return {
    totals: totals.rows[0],
    users: users.rows,
    plans: plans.rows,
    subscriptions: subscriptions.rows,
    payments: payments.rows,
    usage: usage.rows,
    webhooks: webhooks.rows,
    audit: audit.rows,
  };
}
