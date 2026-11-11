import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getWorkspaceUserId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getWorkspaceUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 80) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const pool = getDbPool();
    const conversationQuery = [
      "SELECT id, title FROM public.balmz_conversations",
      "WHERE id = $1 AND user_id = $2 LIMIT 1",
    ].join(" ");
    const conversation = await pool.query<{ id: string; title: string }>(conversationQuery, [id, userId]);
    if (!conversation.rowCount) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const messagesQuery = [
      "SELECT id, role, content, created_at FROM public.balmz_messages",
      "WHERE conversation_id = $1 AND user_id = $2",
      "ORDER BY created_at ASC LIMIT 200",
    ].join(" ");
    const messages = await pool.query<{
      id: string;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>(messagesQuery, [id, userId]);

    return NextResponse.json({
      conversation: conversation.rows[0],
      messages: messages.rows,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await getWorkspaceUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 80) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const result = await getDbPool().query(
      "DELETE FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId],
    );
    if (!result.rowCount) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}
