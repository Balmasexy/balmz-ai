import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const pool = getDbPool();
    const conversation = await pool.query<{ id: string; title: string; updated_at: Date }>(
      "SELECT id, title, updated_at FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 LIMIT 1",
      [id, session.user.id],
    );
    if (!conversation.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const messages = await pool.query<{
      id: string;
      role: "user" | "assistant";
      content: string;
      created_at: Date;
    }>(
      "SELECT id, role, content, created_at FROM public.balmz_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT 200",
      [id, session.user.id],
    );

    return NextResponse.json({
      conversation: conversation.rows[0],
      messages: messages.rows.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        createdAt: item.created_at,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const deleted = await getDbPool().query(
      "DELETE FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, session.user.id],
    );
    if (!deleted.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}
