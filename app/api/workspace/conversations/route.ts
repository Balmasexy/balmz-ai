import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getWorkspaceUserId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getWorkspaceUserId();
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const query = [
      "SELECT id, title, updated_at",
      "FROM public.balmz_conversations",
      "WHERE user_id = $1",
      "ORDER BY updated_at DESC",
      "LIMIT 100",
    ].join(" ");
    const result = await getDbPool().query<{
      id: string;
      title: string;
      updated_at: string;
    }>(query, [userId]);

    return NextResponse.json({ conversations: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "WORKSPACE_STORAGE_UNAVAILABLE",
      message: "Saved conversations are not available yet.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
