import { randomUUID } from "node:crypto";
import { getDbPool } from "@/lib/db";

export type SubscriptionSummary = {
  id: string;
  status: string;
  plan_code: string;
  plan_name: string;
  current_period_starts_at: Date | null;
  current_period_ends_at: Date | null;
  entitlements: Record<string, unknown>;
};

type Entitlements = {
  limits?: Record<string, number>;
};

export async function getCurrentSubscription(
  userId: string,
): Promise<SubscriptionSummary | null> {
  const result = await getDbPool().query<SubscriptionSummary>(
    `SELECT
       s.id,
       s.status,
       p.code AS plan_code,
       p.display_name AS plan_name,
       s.current_period_starts_at,
       s.current_period_ends_at,
       p.entitlements
     FROM public.balmz_subscriptions s
     JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
     WHERE s.user_id = $1
     ORDER BY
       CASE s.status
         WHEN 'active' THEN 0
         WHEN 'trialing' THEN 1
         WHEN 'past_due' THEN 2
         ELSE 3
       END,
       s.created_at DESC
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

/**
 * Atomically records usage against a configured subscription limit.
 * Limits are stored as entitlements.limits[metric] and are measured per
 * UTC calendar month. Missing limits fail closed; they never mean unlimited.
 */
export async function consumeUsage(input: {
  userId: string;
  metric: string;
  units: number;
  source: string;
  idempotencyKey: string;
}): Promise<{ accepted: boolean; duplicate: boolean; used?: number; limit?: number }> {
  const { userId, metric, units, source, idempotencyKey } = input;

  if (!metric || !source || !idempotencyKey) {
    throw new Error("USAGE_REQUEST_INVALID");
  }
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("USAGE_UNITS_INVALID");
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize usage reservations per user so duplicate requests cannot
    // pass the idempotency check concurrently.
    const accountLock = await client.query<{ id: string }>(
      `SELECT id FROM public."user" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!accountLock.rowCount) {
      throw new Error("USER_NOT_FOUND");
    }

    const prior = await client.query<{ id: string }>(
      `SELECT id
       FROM public.balmz_usage_events
       WHERE user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [userId, idempotencyKey],
    );

    if (prior.rowCount) {
      await client.query("COMMIT");
      return { accepted: true, duplicate: true };
    }

    const subscriptionResult = await client.query<{
      subscription_id: string;
      entitlements: Entitlements;
    }>(
      `SELECT s.id AS subscription_id, p.entitlements
       FROM public.balmz_subscriptions s
       JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
       WHERE s.user_id = $1
         AND s.status IN ('active', 'trialing')
         AND p.is_enabled = true
         AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
       ORDER BY s.created_at DESC
       LIMIT 1
       FOR UPDATE OF s`,
      [userId],
    );

    const subscription = subscriptionResult.rows[0];
    if (!subscription) {
      throw new Error("ACTIVE_SUBSCRIPTION_REQUIRED");
    }

    const configuredLimit = subscription.entitlements?.limits?.[metric];
    if (
      typeof configuredLimit !== "number" ||
      !Number.isSafeInteger(configuredLimit) ||
      configuredLimit < 0
    ) {
      throw new Error("USAGE_LIMIT_NOT_CONFIGURED");
    }
    const limit = configuredLimit;

    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    await client.query(
      `INSERT INTO public.balmz_usage_counters
         (user_id, metric, period_start, period_end, units_used, units_limit)
       VALUES ($1, $2, $3, $4, 0, $5)
       ON CONFLICT (user_id, metric, period_start) DO NOTHING`,
      [userId, metric, periodStart, periodEnd, limit],
    );

    const counterResult = await client.query<{ units_used: string; units_limit: string | null }>(
      `SELECT units_used, units_limit
       FROM public.balmz_usage_counters
       WHERE user_id = $1 AND metric = $2 AND period_start = $3
       FOR UPDATE`,
      [userId, metric, periodStart],
    );

    const counter = counterResult.rows[0];
    if (!counter || counter.units_limit === null) {
      throw new Error("USAGE_COUNTER_UNAVAILABLE");
    }

    const used = Number(counter.units_used);
    const currentLimit = Number(counter.units_limit);
    if (used + units > currentLimit) {
      throw new Error("USAGE_LIMIT_EXCEEDED");
    }

    await client.query(
      `UPDATE public.balmz_usage_counters
       SET units_used = units_used + $4, units_limit = $5, updated_at = now()
       WHERE user_id = $1 AND metric = $2 AND period_start = $3`,
      [userId, metric, periodStart, units, limit],
    );

    await client.query(
      `INSERT INTO public.balmz_usage_events
         (id, user_id, metric, units, source, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
      [randomUUID(), userId, metric, units, source, idempotencyKey],
    );

    await client.query("COMMIT");
    return { accepted: true, duplicate: false, used: used + units, limit };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
