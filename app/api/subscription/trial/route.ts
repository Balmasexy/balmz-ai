import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return response("UNAUTHORIZED", "Sign in to start your Pro trial.", 401);

  const userId = session.user.id;
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `SELECT id FROM public."user" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!user.rowCount) {
      await client.query("ROLLBACK");
      return response("USER_NOT_FOUND", "Your account could not be found.", 404);
    }

    const redeemed = await client.query<{ id: string }>(
      `SELECT id FROM public.balmz_trial_redemptions WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (redeemed.rowCount) {
      await client.query("ROLLBACK");
      return response("TRIAL_ALREADY_USED", "The seven-day Pro trial can only be activated once per account.", 409);
    }

    const existing = await client.query<{ id: string; code: string }>(
      `SELECT s.id, p.code
         FROM public.balmz_subscriptions s
         JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = $1
          AND s.status IN ('active', 'trialing', 'past_due')
          AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
        ORDER BY s.created_at DESC LIMIT 1
        FOR UPDATE OF s`,
      [userId],
    );
    if (existing.rows[0] && existing.rows[0].code !== "free") {
      await client.query("ROLLBACK");
      return response("ACTIVE_PLAN_EXISTS", "Your account already has an active paid, trial or complimentary plan.", 409);
    }

    const trialId = randomUUID();
    await client.query(
      `UPDATE public.balmz_subscriptions
          SET status = 'paused', updated_at = now()
        WHERE user_id = $1 AND status = 'active'
          AND plan_id = (SELECT id FROM public.balmz_subscription_plans WHERE code = 'free')`,
      [userId],
    );

    const trial = await client.query<{ id: string }>(
      `INSERT INTO public.balmz_subscriptions
         (id, user_id, plan_id, status, billing_provider, current_period_starts_at, current_period_ends_at)
       SELECT $1, $2, p.id, 'trialing', 'admin', now(), now() + interval '7 days'
         FROM public.balmz_subscription_plans p
        WHERE p.code = 'pro_trial' AND p.is_enabled = true
       RETURNING id`,
      [trialId, userId],
    );
    if (!trial.rowCount) throw new Error("PRO_TRIAL_PLAN_UNAVAILABLE");

    await client.query(
      `INSERT INTO public.balmz_trial_redemptions (id, user_id, subscription_id)
       VALUES ($1, $2, $3)`,
      [randomUUID(), userId, trialId],
    );
    await client.query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, target_user_id, metadata)
       VALUES ($1, $2, 'pro_trial_started', $2, '{"durationDays":7,"aiMessagesPerMonth":500}'::jsonb)`,
      [randomUUID(), userId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true, trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const code = error instanceof Error ? error.message : "";
    if (code === "PRO_TRIAL_PLAN_UNAVAILABLE") return response(code, "The Pro trial plan is not enabled.", 503);
    return response("TRIAL_START_FAILED", "The Pro trial could not be started. Your existing subscription was preserved.", 503);
  } finally {
    client.release();
  }
}
