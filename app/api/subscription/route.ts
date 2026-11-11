import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const subscription = await getCurrentSubscription(session.user.id);
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const usageResult = await getDbPool().query<{
      metric: string;
      units_used: string;
      units_limit: string | null;
      period_end: Date;
    }>(
      `SELECT metric, units_used, units_limit, period_end
         FROM public.balmz_usage_counters
        WHERE user_id = $1 AND period_start = $2
        ORDER BY metric ASC`,
      [session.user.id, periodStart],
    );

    const recordedUsage = new Map(usageResult.rows.map((row) => [row.metric, row]));
    const configuredLimits = subscription?.entitlements?.limits;
    const limits = configuredLimits && typeof configuredLimits === "object" && !Array.isArray(configuredLimits)
      ? configuredLimits as Record<string, unknown>
      : {};
    const usage: Array<{ metric: string; used: number; limit: number | null; periodEnd: string | null }> = Object.entries(limits)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] >= 0)
      .map(([metric, limit]) => {
        const recorded = recordedUsage.get(metric);
        return {
          metric,
          used: recorded ? Number(recorded.units_used) : 0,
          limit,
          periodEnd: recorded ? recorded.period_end.toISOString() : null,
        };
      });
    for (const row of usageResult.rows) {
      if (!usage.some((item) => item.metric === row.metric)) {
        usage.push({
          metric: row.metric,
          used: Number(row.units_used),
          limit: row.units_limit === null ? null : Number(row.units_limit),
          periodEnd: row.period_end.toISOString(),
        });
      }
    }

    return NextResponse.json({
      subscription,
      active: Boolean(subscription),
      usage,
      paymentsEnabled: false,
      message: subscription ? null : "An active BALMZ AI plan is required before sending AI requests.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "SUBSCRIPTION_UNAVAILABLE", message: "Your subscription and usage could not be verified. No AI request should be sent until this check succeeds." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
