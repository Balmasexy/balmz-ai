import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export async function getAdminSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = (session.user as { role?: string }).role;
  if (role !== "admin") return null;
  return session;
}

export async function getAdminOverview() {
  const pool = getDbPool();
  const [users, subscriptions, payments, usage, audit, totals] = await Promise.all([
    pool.query(
      `SELECT id, name, email, role, "emailVerified", "createdAt"
       FROM public."user" ORDER BY "createdAt" DESC LIMIT 50`,
    ),
    pool.query(
      `SELECT s.id, u.name AS user_name, u.email, p.display_name AS plan_name,
              s.status, s.billing_provider, s.current_period_ends_at, s.created_at
       FROM public.balmz_subscriptions s
       JOIN public."user" u ON u.id = s.user_id
       JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC LIMIT 25`,
    ),
    pool.query(
      `SELECT p.id, u.name AS user_name, u.email, p.provider,
              p.provider_reference, p.amount_minor, p.currency, p.status, p.created_at
       FROM public.balmz_payment_records p
       JOIN public."user" u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 25`,
    ),
    pool.query(
      `SELECT c.user_id, u.email, c.metric, c.units_used, c.units_limit,
              c.period_start, c.period_end, c.updated_at
       FROM public.balmz_usage_counters c
       JOIN public."user" u ON u.id = c.user_id
       ORDER BY c.updated_at DESC LIMIT 25`,
    ),
    pool.query(
      `SELECT a.id, a.action, a.metadata, a.created_at,
              actor.email AS actor_email, target.email AS target_email
       FROM public.balmz_admin_audit_log a
       LEFT JOIN public."user" actor ON actor.id = a.actor_user_id
       LEFT JOIN public."user" target ON target.id = a.target_user_id
       ORDER BY a.created_at DESC LIMIT 25`,
    ),
    pool.query(
      `SELECT
         (SELECT count(*)::int FROM public."user") AS users,
         (SELECT count(*)::int FROM public."user" WHERE role = 'admin') AS admins,
         (SELECT count(*)::int FROM public.balmz_subscriptions WHERE status IN ('active','trialing')) AS active_subscriptions,
         (SELECT count(*)::int FROM public.balmz_payment_records WHERE status = 'success') AS successful_payments,
         (SELECT count(*)::int FROM public.balmz_payment_records) AS payment_records,
         (SELECT count(*)::int FROM public.balmz_usage_events) AS usage_events`,
    ),
  ]);

  return {
    totals: totals.rows[0],
    users: users.rows,
    subscriptions: subscriptions.rows,
    payments: payments.rows,
    usage: usage.rows,
    audit: audit.rows,
  };
}
