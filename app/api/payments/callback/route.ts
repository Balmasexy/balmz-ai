import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { verifyAndActivatePaystackCheckout } from "@/lib/payments/paystack-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref") || "";
  const base = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL || "https://balmz-ai.onrender.com";
  const billingUrl = new URL("/dashboard/billing", base);

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    billingUrl.searchParams.set("status", "sign-in-required");
    return NextResponse.redirect(billingUrl);
  }
  if (!reference || !/^[A-Za-z0-9.=-]{8,120}$/.test(reference)) {
    billingUrl.searchParams.set("status", "invalid-reference");
    return NextResponse.redirect(billingUrl);
  }

  try {
    const owner = await getDbPool().query<{ user_id: string }>(
      "SELECT user_id FROM public.balmz_checkout_attempts WHERE reference = $1 OR provider_reference = $1 ORDER BY created_at DESC LIMIT 1",
      [reference],
    );
    if (!owner.rows[0] || owner.rows[0].user_id !== session.user.id) {
      billingUrl.searchParams.set("status", "checkout-not-found");
      return NextResponse.redirect(billingUrl);
    }

    const result = await verifyAndActivatePaystackCheckout(reference);
    billingUrl.searchParams.set("status", result.success ? "success" : "pending");
    return NextResponse.redirect(billingUrl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_VERIFICATION_FAILED";
    billingUrl.searchParams.set("status", code === "CHECKOUT_EXPIRED" ? "expired" : "verification-failed");
    return NextResponse.redirect(billingUrl);
  }
}
