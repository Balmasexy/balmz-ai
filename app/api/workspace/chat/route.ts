import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getWorkspaceAIConfig, getWorkspaceUserId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviousMessage = {
  role: "user" | "assistant";
  content: string;
};

function positiveMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message || message.length > 12000) return null;
  return message;
}

function safeProviderMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The OpenAI provider rejected the server configuration. Ask the workspace administrator to check the provider key and project access.";
  }
  if (status === 429) {
    return "The AI provider is currently rate-limiting requests. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "The AI provider is temporarily unavailable. Please try again shortly.";
  }
  return "The AI provider could not accept this request. Check the message and try again.";
}

function eventLine(value: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value) + "\n");
}

export async function POST(request: Request) {
  const userId = await getWorkspaceUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Sign in to send a message." }, { status: 401 });
  }

  const config = getWorkspaceAIConfig();
  if (!config.enabled || !config.apiKey) {
    return NextResponse.json({
      error: "AI_NOT_CONFIGURED",
      message: "AI chat is not enabled yet. Configure the OpenAI key on the BALMZ AI Render service.",
    }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST", message: "The message request was not valid JSON." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32768) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE", message: "The message request is too large." }, { status: 413 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "INVALID_REQUEST", message: "A message is required." }, { status: 400 });
  }
  const input = body as { conversationId?: unknown; message?: unknown };
  const message = positiveMessage(input.message);
  const conversationId = typeof input.conversationId === "string" && input.conversationId.length <= 80
    ? input.conversationId
    : null;
  if (!message) {
    return NextResponse.json({ error: "MESSAGE_INVALID", message: "Enter a message of up to 12,000 characters." }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  let resolvedConversationId = conversationId;
  let priorMessages: PreviousMessage[] = [];

  try {
    await client.query("BEGIN");

    const accountLock = await client.query<{ id: string }>(
      "SELECT id FROM public.\"user\" WHERE id = $1 FOR UPDATE",
      [userId],
    );
    if (!accountLock.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "UNAUTHORIZED", message: "The account could not be verified." }, { status: 401 });
    }

    const dailyCountQuery = [
      "SELECT count(*)::text AS total FROM public.balmz_messages",
      "WHERE user_id = $1 AND role = 'user'",
      "AND created_at >= now() - interval '24 hours'",
    ].join(" ");
    const dailyCount = await client.query<{ total: string }>(dailyCountQuery, [userId]);
    if (Number(dailyCount.rows[0]?.total ?? 0) >= config.dailyMessageLimit) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: "DAILY_LIMIT_REACHED",
        message: "You have reached today's BALMZ AI message allowance. Please try again later.",
      }, { status: 429 });
    }

    if (resolvedConversationId) {
      const ownedQuery = [
        "SELECT id FROM public.balmz_conversations",
        "WHERE id = $1 AND user_id = $2 FOR UPDATE",
      ].join(" ");
      const owned = await client.query<{ id: string }>(ownedQuery, [resolvedConversationId, userId]);
      if (!owned.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "NOT_FOUND", message: "This conversation was not found." }, { status: 404 });
      }

      const previousQuery = [
        "SELECT role, content FROM public.balmz_messages",
        "WHERE conversation_id = $1 AND user_id = $2",
        "ORDER BY created_at DESC LIMIT 20",
      ].join(" ");
      const previous = await client.query<PreviousMessage>(previousQuery, [resolvedConversationId, userId]);
      priorMessages = previous.rows.reverse();
    } else {
      resolvedConversationId = randomUUID();
      const title = message.replace(/\s+/g, " ").slice(0, 72);
      await client.query(
        "INSERT INTO public.balmz_conversations (id, user_id, title) VALUES ($1, $2, $3)",
        [resolvedConversationId, userId, title || "New chat"],
      );
    }

    await client.query(
      "INSERT INTO public.balmz_messages (id, conversation_id, user_id, role, content) VALUES ($1, $2, $3, 'user', $4)",
      [randomUUID(), resolvedConversationId, userId, message],
    );
    await client.query(
      "UPDATE public.balmz_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2",
      [resolvedConversationId, userId],
    );

    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({
      error: "WORKSPACE_STORAGE_UNAVAILABLE",
      message: "The conversation could not be saved. Check the workspace database setup.",
    }, { status: 503 });
  } finally {
    client.release();
  }

  const boundedHistory = priorMessages.slice(-16).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 3000),
  }));
  const apiInput = [
    ...boundedHistory,
    { role: "user", content: message },
  ];

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: config.model,
        instructions: "You are BALMZ AI, a practical and reliable assistant inside a private AI workplace. Be clear, useful, and honest. Do not claim to have taken actions, accessed files, or verified facts unless the relevant tool or data actually supports it. Distinguish uncertainty from fact. Format code clearly. Avoid inventing account, billing, or platform data.",
        input: apiInput,
        stream: true,
        store: false,
        max_output_tokens: config.maxOutputTokens,
      }),
      signal: request.signal,
    });
  } catch {
    return NextResponse.json({
      error: "AI_PROVIDER_UNAVAILABLE",
      message: "BALMZ AI could not reach the OpenAI provider. Check your connection and provider configuration.",
    }, { status: 502 });
  }

  if (!providerResponse.ok) {
    return NextResponse.json({
      error: "AI_PROVIDER_ERROR",
      message: safeProviderMessage(providerResponse.status),
    }, { status: providerResponse.status === 429 ? 429 : 502 });
  }
  if (!providerResponse.body) {
    return NextResponse.json({
      error: "AI_STREAM_UNAVAILABLE",
      message: "The AI provider returned no response stream. Please try again.",
    }, { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controllerStream) {
      const reader = providerResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let providerResponseId: string | null = null;
      let failure: string | null = null;

      const processFrame = (frame: string) => {
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data || data === "[DONE]") return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return;
        }

        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          answer += event.delta;
          controllerStream.enqueue(eventLine({ type: "delta", text: event.delta }));
          return;
        }
        if (event.type === "response.completed") {
          const response = event.response;
          if (response && typeof response === "object" && "id" in response && typeof response.id === "string") {
            providerResponseId = response.id;
          }
          return;
        }
        if (event.type === "response.failed" || event.type === "error") {
          failure = "The AI provider could not complete this response. Please try again.";
        }
      };

      try {
        while (true) {
          const part = await reader.read();
          buffer += decoder.decode(part.value, { stream: !part.done });
          const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) processFrame(frame);
          if (part.done) break;
        }
        if (buffer.trim()) processFrame(buffer);

        if (answer.trim()) {
          await pool.query(
            "INSERT INTO public.balmz_messages (id, conversation_id, user_id, role, content, provider_response_id, model) VALUES ($1, $2, $3, 'assistant', $4, $5, $6)",
            [randomUUID(), resolvedConversationId, userId, answer, providerResponseId, config.model],
          );
          await pool.query(
            "UPDATE public.balmz_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2",
            [resolvedConversationId, userId],
          );
          controllerStream.enqueue(eventLine({ type: "done" }));
        } else {
          controllerStream.enqueue(eventLine({
            type: "error",
            message: failure || "The AI provider returned an empty response. Please try again.",
          }));
        }
      } catch {
        controllerStream.enqueue(eventLine({
          type: "error",
          message: failure || "The response was interrupted before it could be saved.",
        }));
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // The stream may already be closed.
        }
        controllerStream.close();
      }
    },
    async cancel() {
      try {
        await providerResponse.body?.cancel();
      } catch {
        // The upstream request may already be closed.
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-balmz-conversation-id": resolvedConversationId || "",
    },
  });
}
