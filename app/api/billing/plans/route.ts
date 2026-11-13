import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isPaymentEnvironmentEnabled } from "@/lib/payments/paystack-billing";
import { getCurrentSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const [plans, demoEnabled, liveEnabled, current, trialRedemption] = await Promise.all([
      getDbPool().query<{
        id: string; code: string; display_name: string; description: string | null;
        currency: string | null; price_minor: string | null; billing_interval: string | null;
        entitlements: Record<string, unknown>;
      }>(
        `SELECT id, code, display_name, description, currency, price_minor, billing_interval, entitlements
           FROM public.balmz_subscription_plans
          WHERE is_public = true AND is_enabled = true
          ORDER BY price_minor ASC NULLS LAST, display_name ASC`,
      ),
      isPaymentEnvironmentEnabled("demo"),
      isPaymentEnvironmentEnabled("live"),
      getCurrentSubscription(session.user.id),
      getDbPool().query<{ redeemed: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM public.balmz_trial_redemptions WHERE user_id = $1) AS redeemed`,
        [session.user.id],
      ),
    ]);
    return NextResponse.json({
      plans: plans.rows.map((plan) => ({
        ...plan,
        priceMinor: plan.price_minor,
        priceMinorNumber: plan.price_minor === null ? null : Number(plan.price_minor),
        currency: plan.currency?.trim().toUpperCase() ?? null,
      })),
      paymentModes: { demo: demoEnabled, live: liveEnabled },
      activeSubscription: current ? {
        plan_name: current.plan_name,
        plan_code: current.plan_code,
        status: current.status,
        current_period_ends_at: current.current_period_ends_at?.toISOString?.() ?? null,
      } : null,
      trialAvailable: trialRedemption.rows[0]?.redeemed !== true && current?.plan_code === "free",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "BILLING_DATA_UNAVAILABLE",
      message: "The billing catalogue is not available yet. Ask the administrator to finish the billing database setup.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
