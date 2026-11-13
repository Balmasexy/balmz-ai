import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

async function currentUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  try {
    const result = await getDbPool().query<{ id: string; title: string; updated_at: Date }>(
      "SELECT id, title, updated_at FROM public.balmz_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100",
      [userId],
    );
    return NextResponse.json({
      storage: "database",
      conversations: result.rows.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updated_at,
      })),
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ storage: "local-only", conversations: [] }, { headers: noStore });
    }
    return NextResponse.json({ error: "WORKSPACE_STORAGE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

type ImportedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  hasAttachments?: boolean;
};
type ImportedConversation = {
  id: string;
  title: string;
  updatedAt?: string;
  messages: ImportedMessage[];
};

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  const length = Number(request.headers.get("content-length") || "0");
  if (length > 2_000_000) return NextResponse.json({ error: "IMPORT_TOO_LARGE" }, { status: 413, headers: noStore });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  const raw = body && typeof body === "object" ? (body as { conversations?: unknown }).conversations : null;
  if (!Array.isArray(raw) || raw.length > 100) {
    return NextResponse.json({ error: "INVALID_CONVERSATIONS" }, { status: 400, headers: noStore });
  }

  const items: ImportedConversation[] = [];
  let totalMessages = 0;
  let totalChars = 0;
  for (const value of raw) {
    if (!value || typeof value !== "object") return NextResponse.json({ error: "INVALID_CONVERSATION" }, { status: 400, headers: noStore });
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !UUID.test(item.id) ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 200 ||
        !Array.isArray(item.messages) || item.messages.length > 200) {
      return NextResponse.json({ error: "INVALID_CONVERSATION" }, { status: 400, headers: noStore });
    }
    const messages: ImportedMessage[] = [];
    for (const rawMessage of item.messages) {
      if (!rawMessage || typeof rawMessage !== "object") return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 400, headers: noStore });
      const message = rawMessage as Record<string, unknown>;
      if (typeof message.id !== "string" || !UUID.test(message.id) ||
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string" || !message.content.trim() || message.content.length > 12_000) {
        return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 400, headers: noStore });
      }
      totalMessages += 1;
      totalChars += message.content.length;
      if (totalMessages > 2_000 || totalChars > 1_000_000) {
        return NextResponse.json({ error: "IMPORT_TOO_LARGE" }, { status: 413, headers: noStore });
      }
      messages.push({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: typeof message.createdAt === "string" ? message.createdAt : undefined,
        hasAttachments: message.hasAttachments === true || Array.isArray(message.images) && message.images.length > 0,
      });
    }
    items.push({
      id: item.id,
      title: item.title.trim(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
      messages,
    });
  }

  const client = await getDbPool().connect();
  let importedConversations = 0;
  let importedMessages = 0;
  try {
    await client.query("BEGIN");
    for (const item of items) {
      await client.query(
        `INSERT INTO public.balmz_conversations (id, user_id, title)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [item.id, userId, item.title],
      );
      const owned = await client.query<{ id: string }>(
        "SELECT id FROM public.balmz_conversations WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [item.id, userId],
      );
      // An ID already belonging to another account is ignored without revealing that account.
      if (!owned.rowCount) continue;
      importedConversations += 1;
      for (const message of item.messages) {
        const date = message.createdAt && Number.isFinite(Date.parse(message.createdAt))
          ? new Date(message.createdAt)
          : new Date();
        const inserted = await client.query(
          `INSERT INTO public.balmz_messages
             (id, conversation_id, user_id, role, content, has_attachments, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)
           ON CONFLICT (id) DO NOTHING`,
          [message.id, item.id, userId, message.role, message.content, message.hasAttachments === true, date],
        );
        importedMessages += inserted.rowCount ?? 0;
      }
      await client.query(
        `UPDATE public.balmz_conversations
            SET title = CASE WHEN title = 'New chat' THEN $3 ELSE title END,
                updated_at = GREATEST(updated_at, COALESCE($4::timestamptz, now()))
          WHERE id = $1 AND user_id = $2`,
        [item.id, userId, item.title, item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)) ? new Date(item.updatedAt) : null],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true, importedConversations, importedMessages }, { headers: noStore });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "WORKSPACE_MIGRATION_REQUIRED" }, { status: 503, headers: noStore });
    }
    return NextResponse.json({ error: "WORKSPACE_IMPORT_FAILED" }, { status: 503, headers: noStore });
  } finally {
    client.release();
  }
}
