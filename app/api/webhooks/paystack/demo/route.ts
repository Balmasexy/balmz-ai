import { handlePaystackWebhook } from "@/lib/payments/paystack-webhook";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handlePaystackWebhook(request, "demo");
  } catch {
    return NextResponse.json({ error: "PAYSTACK_WEBHOOK_UNAVAILABLE" }, { status: 503 });
  }
}
