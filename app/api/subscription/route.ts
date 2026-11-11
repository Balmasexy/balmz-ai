import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const subscription = await getCurrentSubscription(session.user.id);
    return NextResponse.json({
      subscription,
      paymentsEnabled: false,
    });
  } catch {
    return NextResponse.json(
      { error: "SUBSCRIPTION_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
