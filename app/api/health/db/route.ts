import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await getDbPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch {
    // Do not return SQL errors, hostnames, or database connection details.
    return NextResponse.json(
      { status: "error", database: "unavailable" },
      { status: 503 },
    );
  }
}
