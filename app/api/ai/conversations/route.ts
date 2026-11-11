import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await getDbPool().query<{ id: string; title: string; updated_at: Date }>(
      "SELECT id, title, updated_at FROM public.balmz_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100",
      [session.user.id],
    );

    return NextResponse.json({
      conversations: result.rows.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updated_at,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "WORKSPACE_STORAGE_UNAVAILABLE",
      message: "Saved conversations are not available until workspace storage is set up.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
