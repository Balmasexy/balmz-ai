import { NextResponse } from "next/server";
import { getAdminSession, getAdminOverview } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const overview = await getAdminOverview();
    return NextResponse.json({ overview, paymentsEnabled: false });
  } catch {
    return NextResponse.json({ error: "ADMIN_OVERVIEW_UNAVAILABLE" }, { status: 503 });
  }
}
