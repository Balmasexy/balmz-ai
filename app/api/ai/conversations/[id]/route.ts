import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };

async function currentUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: noStore });

  try {
    const pool = getDbPool();
    const conversation = await pool.query<{ id: string; title: string; updated_at: Date }>(
      "SELECT id, title, updated_at FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 LIMIT 1",
      [id, userId],
    );
    if (!conversation.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: noStore });

    const messages = await pool.query<{
      id: string;
      role: "user" | "assistant";
      content: string;
      created_at: Date;
      request_id: string | null;
      model: string | null;
      provider_id: string | null;
      has_attachments: boolean;
      status: "queued" | "completed" | "failed";
    }>(
      `SELECT id, role, content, created_at, request_id, model, provider_id, has_attachments, status
         FROM public.balmz_messages
        WHERE conversation_id = $1 AND user_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 400`,
      [id, userId],
    );

    return NextResponse.json({
      conversation: conversation.rows[0],
      messages: messages.rows.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        createdAt: item.created_at,
        requestId: item.request_id,
        model: item.model,
        provider: item.provider_id,
        hasAttachments: item.has_attachments,
        status: item.status,
      })),
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "WORKSPACE_MIGRATION_REQUIRED" }, { status: 503, headers: noStore });
    }
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: noStore });

  try {
    const deleted = await getDbPool().query(
      "DELETE FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId],
    );
    if (!deleted.rowCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: noStore });
    return new Response(null, { status: 204, headers: noStore });
  } catch {
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
