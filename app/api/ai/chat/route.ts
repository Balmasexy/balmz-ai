import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviousMessage = { role: "user" | "assistant"; content: string };

function safeError(code: string, status: number, message: string) {
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

function eventLine(value: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value) + "\n");
}

export async function POST(request: Request): Promise<Response> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return safeError("UNAUTHORIZED", 401, "Sign in to use BALMZ AI.");

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return safeError("AI_PROVIDER_NOT_CONFIGURED", 503, "The OpenAI provider key has not been configured on the server.");

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 24_000) return safeError("REQUEST_TOO_LARGE", 413, "This message is too large. Start a new chat.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return safeError("INVALID_JSON", 400, "The request body must be valid JSON.");
  }
  if (!body || typeof body !== "object") return safeError("INVALID_REQUEST", 400, "A message is required.");

  const input = body as { message?: unknown; conversationId?: unknown; model?: unknown };
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message || message.length > 12_000) {
    return safeError("INVALID_MESSAGE", 400, "Enter a message between 1 and 12,000 characters.");
  }

  let conversationId = typeof input.conversationId === "string" ? input.conversationId : null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (conversationId && !uuidPattern.test(conversationId)) {
    return safeError("INVALID_CONVERSATION", 400, "The conversation identifier is invalid.");
  }

  const requestedModel = input.model;
  const model = requestedModel === "gpt-4.1" ? "gpt-4.1" : "gpt-4.1-mini";

  let subscription;
  try {
    subscription = await getCurrentSubscription(session.user.id);
  } catch {
    return safeError("SUBSCRIPTION_UNAVAILABLE", 503, "Your subscription could not be checked. No request was sent to the AI provider.");
  }
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return safeError("ACTIVE_PLAN_REQUIRED", 402, "AI chat requires an active BALMZ AI plan.");
  }

  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: "client_chat",
      idempotencyKey: randomUUID(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
    if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
      return safeError("AI_ALLOWANCE_UNAVAILABLE", 402, "Your plan does not currently include an available ai_messages allowance.");
    }
    return safeError("USAGE_UNAVAILABLE", 503, "The usage allowance could not be reserved. No AI request was sent.");
  }

  const pool = getDbPool();
  const client = await pool.connect();
  let previous: PreviousMessage[] = [];
  try {
    await client.query("BEGIN");

    if (!conversationId) {
      conversationId = randomUUID();
      const title = message.replace(/\s+/g, " ").slice(0, 72) || "New chat";
      await client.query(
        "INSERT INTO public.balmz_conversations (id, user_id, title) VALUES ($1, $2, $3)",
        [conversationId, session.user.id, title],
      );
    } else {
      const existing = await client.query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM public.balmz_conversations WHERE id = $1 FOR UPDATE",
        [conversationId],
      );
      if (existing.rowCount && existing.rows[0].user_id !== session.user.id) {
        await client.query("ROLLBACK");
        return safeError("NOT_FOUND", 404, "This conversation was not found.");
      }
      if (!existing.rowCount) {
        const title = message.replace(/\s+/g, " ").slice(0, 72) || "New chat";
        await client.query(
          "INSERT INTO public.balmz_conversations (id, user_id, title) VALUES ($1, $2, $3)",
          [conversationId, session.user.id, title],
        );
      } else {
        const previousResult = await client.query<PreviousMessage>(
          "SELECT role, content FROM public.balmz_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 18",
          [conversationId, session.user.id],
        );
        previous = previousResult.rows.reverse();
      }
    }

    await client.query(
      "INSERT INTO public.balmz_messages (id, conversation_id, user_id, role, content) VALUES ($1, $2, $3, 'user', $4)",
      [randomUUID(), conversationId, session.user.id, message],
    );
    await client.query(
      "UPDATE public.balmz_conversations SET updated_at = now(), title = CASE WHEN title = 'New chat' THEN $3 ELSE title END WHERE id = $1 AND user_id = $2",
      [conversationId, session.user.id, message.replace(/\s+/g, " ").slice(0, 72) || "New chat"],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return safeError("WORKSPACE_STORAGE_UNAVAILABLE", 503, "The conversation could not be saved. Check the workspace database setup.");
  } finally {
    client.release();
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are BALMZ AI, a useful and reliable assistant in a private AI workplace. Be clear, practical and honest. Do not claim to access files, browse the web, or take actions unless those capabilities are actually connected. Distinguish verified facts from uncertainty.",
          },
          ...previous,
          { role: "user", content: message },
        ],
        max_tokens: 1800,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      cache: "no-store",
    });
  } catch {
    return safeError("AI_PROVIDER_UNAVAILABLE", 502, "The AI provider could not be reached. Please try again.");
  }

  if (!upstream.ok) {
    const messageText = upstream.status === 401 || upstream.status === 403
      ? "The OpenAI provider rejected the server configuration. Ask the administrator to check the provider key."
      : upstream.status === 429
        ? "The AI provider is temporarily rate-limited. Please try again later."
        : "The AI provider could not complete this response. Please try again.";
    return safeError("AI_PROVIDER_ERROR", upstream.status === 429 ? 503 : 502, messageText);
  }
  if (!upstream.body) return safeError("AI_STREAM_UNAVAILABLE", 502, "The provider returned no response stream.");

  const currentConversationId = typeof conversationId === "string" ? conversationId : null;
  if (!currentConversationId) {
    try { await upstream.body?.cancel(); } catch { /* already closed */ }
    return safeError("CONVERSATION_CREATE_FAILED", 500, "The conversation could not be initialized.");
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      let providerResponseId: string | null = null;

      function processFrame(frame: string) {
        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!payload || payload === "[DONE]") return;

        try {
          const event = JSON.parse(payload) as {
            id?: string;
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          if (event.id) providerResponseId = event.id;
          const delta = event.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length) {
            reply += delta;
            controller.enqueue(eventLine({ type: "delta", text: delta }));
          }
        } catch {
          // Ignore malformed provider keepalive frames.
        }
      }

      try {
        while (true) {
          const chunk = await reader.read();
          buffer += decoder.decode(chunk.value, { stream: !chunk.done });
          const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) processFrame(frame);
          if (chunk.done) break;
        }
        if (buffer.trim()) processFrame(buffer);

        if (!reply.trim()) {
          controller.enqueue(eventLine({ type: "error", message: "The AI provider returned an empty response." }));
          return;
        }

        await pool.query(
          "INSERT INTO public.balmz_messages (id, conversation_id, user_id, role, content, provider_response_id, model) VALUES ($1, $2, $3, 'assistant', $4, $5, $6)",
          [randomUUID(), currentConversationId, session.user.id, reply, providerResponseId, model],
        );
        await pool.query(
          "UPDATE public.balmz_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2",
          [currentConversationId, session.user.id],
        );
        controller.enqueue(eventLine({ type: "done", model, conversationId: currentConversationId }));
      } catch {
        try {
          controller.enqueue(eventLine({ type: "error", message: "The response was interrupted before it could be saved." }));
        } catch {
          // The browser may have canceled the stream.
        }
      } finally {
        try { reader.releaseLock(); } catch { /* already released */ }
        try { controller.close(); } catch { /* browser canceled the stream */ }
      }
    },
    async cancel() {
      try { await upstream.body?.cancel(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "x-balmz-conversation-id": currentConversationId,
    },
  });
}
