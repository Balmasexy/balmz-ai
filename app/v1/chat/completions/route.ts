import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateBalmzApiKey, sha256ApiKey } from "@/lib/api-keys";
import { consumeUsage } from "@/lib/subscriptions";
import { sendWorldWalletGeminiBackendMessage } from "@/lib/integrations/world-wallet-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_MODEL_ID = "balmz-fast";
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 80_000;

type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function errorResponse(message: string, type: string, code: string, status: number) {
  return NextResponse.json(
    { error: { message, type, param: null, code } },
    { status, headers: { "Cache-Control": "no-store", ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } },
  );
}

function streamingResponse(reply: string, id: string, created: number) {
  const encoder = new TextEncoder();
  const model = PUBLIC_MODEL_ID;
  const events = [
    { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] },
    { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: reply }, finish_reason: null }] },
    { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let apiKey;
  try {
    apiKey = await authenticateBalmzApiKey(request, "ai:chat");
  } catch {
    return errorResponse("API authentication is temporarily unavailable.", "server_error", "api_auth_unavailable", 503);
  }
  if (!apiKey) {
    return errorResponse("A valid BALMZ API key with the ai:chat scope is required.", "authentication_error", "invalid_api_key", 401);
  }
  if (!apiKey.createdByUserId) {
    return errorResponse("This API key is not linked to an active BALMZ AI account.", "permission_error", "api_key_owner_missing", 403);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 300_000) {
    return errorResponse("The request body is too large.", "invalid_request_error", "request_too_large", 413);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return errorResponse("The request body must be valid JSON.", "invalid_request_error", "invalid_json", 400); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("The request body must be a JSON object.", "invalid_request_error", "invalid_body", 400);
  }
  const input = body as Record<string, unknown>;
  const model = typeof input.model === "string" ? input.model : PUBLIC_MODEL_ID;
  if (model !== PUBLIC_MODEL_ID) {
    return errorResponse("The requested model is not available. Use model 'balmz-fast'.", "invalid_request_error", "model_not_found", 404);
  }
  if (input.stream !== undefined && typeof input.stream !== "boolean") {
    return errorResponse("The stream field must be a boolean.", "invalid_request_error", "invalid_stream", 400);
  }
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > MAX_MESSAGES) {
    return errorResponse("Send between 1 and 20 messages.", "invalid_request_error", "invalid_messages", 400);
  }

  const messages: ProviderMessage[] = [];
  let totalChars = 0;
  for (const [index, item] of input.messages.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return errorResponse("A chat message is invalid.", "invalid_request_error", "invalid_message", 400);
    }
    const message = item as Record<string, unknown>;
    const role = message.role === "developer" ? "system" : message.role;
    const content = message.content;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return errorResponse("Messages must use system, developer, user or assistant roles.", "invalid_request_error", "invalid_role", 400);
    }
    if (typeof content !== "string" || content.length > MAX_MESSAGE_CHARS) {
      return errorResponse("Message content must be text and no longer than 12,000 characters.", "invalid_request_error", "invalid_content", 400);
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return errorResponse("The combined message content is too long.", "invalid_request_error", "context_too_large", 413);
    }
    messages.push({ role, content });
  }
  if (messages[messages.length - 1]?.role !== "user") {
    return errorResponse("The latest chat message must be from the user.", "invalid_request_error", "invalid_turn", 400);
  }

  const suppliedIdempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (suppliedIdempotencyKey && (suppliedIdempotencyKey.length > 200 || /[\r\n]/.test(suppliedIdempotencyKey))) {
    return errorResponse("Idempotency-Key must be 200 characters or fewer.", "invalid_request_error", "invalid_idempotency_key", 400);
  }
  const idempotencyKey = "api:" + apiKey.id + ":" + (suppliedIdempotencyKey ? sha256ApiKey(suppliedIdempotencyKey) : randomUUID());

  try {
    await consumeUsage({
      userId: apiKey.createdByUserId,
      metric: "ai_messages",
      units: 1,
      source: "api_chat_completions",
      idempotencyKey,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
    if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
      return errorResponse("The BALMZ AI account linked to this key has no remaining ai_messages allowance.", "rate_limit_error", "usage_limit_exceeded", 429);
    }
    return errorResponse("The BALMZ AI account usage allowance could not be reserved.", "server_error", "usage_unavailable", 503);
  }

  let result: { reply: string; model: string };
  try {
    result = await sendWorldWalletGeminiBackendMessage(apiKey.createdByUserId, messages);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_PROVIDER_ERROR";
    console.warn("[BALMZ API] Chat completion failed", { code, apiKeyId: apiKey.id });
    if (code === "AI_PROXY_NOT_CONFIGURED" || code === "AI_PROVIDER_NOT_CONFIGURED") {
      return errorResponse("BALMZ AI's server-managed model is not configured.", "server_error", "model_not_configured", 503);
    }
    if (code === "AI_PROVIDER_KEY_REJECTED") {
      return errorResponse("BALMZ AI's upstream Gemini credential was rejected by Google.", "server_error", "upstream_auth_failed", 503);
    }
    if (code === "AI_PROVIDER_AUTH_FAILED") {
      return errorResponse("The BALMZ AI server could not authenticate the linked account.", "server_error", "upstream_auth_failed", 503);
    }
    if (code === "AI_PROVIDER_RATE_LIMITED") {
      return errorResponse("BALMZ AI is temporarily rate-limited by its model provider.", "rate_limit_error", "upstream_rate_limited", 429);
    }
    if (code === "AI_PROVIDER_EMPTY_RESPONSE") {
      return errorResponse("The model returned an empty response. Please retry.", "server_error", "empty_completion", 502);
    }
    return errorResponse("BALMZ AI could not reach its model provider.", "server_error", "upstream_unavailable", 502);
  }

  const completionId = "chatcmpl-" + randomUUID().replace(/-/g, "");
  const created = Math.floor(Date.now() / 1000);
  if (input.stream === true) return streamingResponse(result.reply, completionId, created);

  return NextResponse.json({
    id: completionId,
    object: "chat.completion",
    created,
    model: PUBLIC_MODEL_ID,
    choices: [{
      index: 0,
      message: { role: "assistant", content: result.reply },
      finish_reason: "stop",
    }],
  }, { headers: { "Cache-Control": "no-store" } });
}
