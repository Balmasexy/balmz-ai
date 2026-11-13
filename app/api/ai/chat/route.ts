import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";
import { findAIProviderConnection, sendAIProviderMessage, toOpenAIChatMessages, type AIImageAttachment, type AIProviderConnection } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string; images?: AIImageAttachment[] };

function safeError(code: string, status: number, message: string) {
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return safeError("UNAUTHORIZED", 401, "Sign in to use BALMZ AI.");

  let body: unknown;
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 12_000_000) return safeError("REQUEST_TOO_LARGE", 413, "This message is too large. Try fewer or smaller images.");
    body = await request.json();
  } catch {
    return safeError("INVALID_JSON", 400, "The request body must be valid JSON.");
  }

  const candidate = (body as { messages?: unknown } | null)?.messages;
  const requestedRequestId = (body as { requestId?: unknown } | null)?.requestId;
  const requestId = typeof requestedRequestId === "string" && /^[0-9a-f-]{36}$/i.test(requestedRequestId)
    ? requestedRequestId
    : randomUUID();
  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 20) {
    return safeError("INVALID_MESSAGES", 400, "Send between 1 and 20 recent messages.");
  }

  const messages: ChatMessage[] = [];
  let totalImageBytes = 0;
  for (const item of candidate) {
    if (!item || typeof item !== "object") return safeError("INVALID_MESSAGE", 400, "A message is invalid.");
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    const rawImages = (item as { images?: unknown }).images;
    if (role !== "user" && role !== "assistant") {
      return safeError("INVALID_MESSAGE", 400, "Messages must use a valid user or assistant role.");
    }
    if (typeof content !== "string" || content.length > 12_000) {
      return safeError("INVALID_MESSAGE", 400, "Message text must be under 12,000 characters.");
    }
    if (rawImages !== undefined && (!Array.isArray(rawImages) || rawImages.length > 4 || role !== "user")) {
      return safeError("INVALID_IMAGES", 400, "Attach up to four images to a user message.");
    }
    const images: AIImageAttachment[] = [];
    for (const raw of (rawImages ?? []) as unknown[]) {
      if (!raw || typeof raw !== "object") return safeError("INVALID_IMAGE", 400, "An image attachment is invalid.");
      const mimeType = (raw as { mimeType?: unknown }).mimeType;
      const dataBase64 = (raw as { dataBase64?: unknown }).dataBase64;
      if (typeof mimeType !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) ||
          typeof dataBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
        return safeError("INVALID_IMAGE", 400, "Only JPEG, PNG and WebP image uploads are supported.");
      }
      const imageBytes = Buffer.from(dataBase64, "base64").byteLength;
      if (!imageBytes || imageBytes > 4_000_000) return safeError("IMAGE_TOO_LARGE", 413, "Each image must be smaller than 4 MB after compression.");
      totalImageBytes += imageBytes;
      if (totalImageBytes > 8_000_000) return safeError("IMAGES_TOO_LARGE", 413, "Please keep all attached images under 8 MB total.");
      images.push({ mimeType: mimeType as AIImageAttachment["mimeType"], dataBase64 });
    }
    if (!content.trim() && !images.length) return safeError("INVALID_MESSAGE", 400, "Add a message or attach an image.");
    messages.push({ role, content: content.trim(), ...(images.length ? { images } : {}) });
  }
  if (messages[messages.length - 1]?.role !== "user") {
    return safeError("INVALID_TURN", 400, "The latest message must be from the user.");
  }

  let subscription;
  try {
    subscription = await getCurrentSubscription(session.user.id);
  } catch {
    return safeError("SUBSCRIPTION_UNAVAILABLE", 503, "Your subscription could not be checked. No request was sent to the AI provider.");
  }
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return safeError("ACTIVE_PLAN_REQUIRED", 402, "An active BALMZ AI plan is required before sending AI requests.");
  }

  let providerMessages: AIMessage[] = messages;
  try {
    const familyAccess = subscription.plan_code === "family_complimentary"
      ? await getActiveComplimentaryAccess(session.user.id)
      : null;
    if (familyAccess) {
      providerMessages = [
        {
          role: "system",
          content: "BALMZ AI shared family workspace instruction. Prompt tag: " + familyAccess.promptTag + ". Follow this shared instruction in addition to the user's latest request, subject to all safety and privacy rules:\n\n" + familyAccess.sharedPrompt,
        },
        ...messages,
      ];
    }
  } catch {
    return safeError("FAMILY_ACCESS_UNAVAILABLE", 503, "Your shared workspace instructions could not be verified. No AI request was sent.");
  }

  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: "client_chat",
      idempotencyKey: requestId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
    if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
      return safeError("AI_ALLOWANCE_UNAVAILABLE", 402, "Your plan does not currently include an available ai_messages allowance. Contact the workspace administrator.");
    }
    return safeError("USAGE_UNAVAILABLE", 503, "The usage allowance could not be reserved. No AI request was sent.");
  }

  const requestedModel = (body as { model?: unknown } | null)?.model;
  const modelChoice = typeof requestedModel === "string" ? requestedModel : "env:gpt-4.1-mini";

  if (modelChoice.startsWith("connection:")) {
    const connectionId = modelChoice.slice("connection:".length);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(connectionId)) {
      return safeError("AI_MODEL_INVALID", 400, "The selected AI connection is invalid.");
    }

    try {
      const connection = await findAIProviderConnection(connectionId);
      if (!connection) return safeError("AI_MODEL_UNAVAILABLE", 503, "This AI connection is no longer available. Refresh the model list and select another provider.");
      const reply = await sendAIProviderMessage(connection, providerMessages);
      return NextResponse.json({
        reply,
        model: connection.model_id,
        provider: connection.provider_id,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AI_PROVIDER_ERROR";
      if (code === "AI_PROVIDER_AUTH_FAILED") return safeError(code, 503, "The selected provider rejected its saved API key. Ask the Super Admin to reconnect it.");
      if (code === "AI_PROVIDER_RATE_LIMITED") return safeError(code, 503, "The selected provider is temporarily rate-limited. Please try again later.");
      if (code === "AI_PROVIDER_UNAVAILABLE") return safeError(code, 502, "The selected provider could not be reached. Please try again later.");
      if (code === "AI_PROVIDER_DISABLED") return safeError(code, 503, "This AI connection has been disabled. Refresh the model list and choose another provider.");
      return safeError("AI_PROVIDER_ERROR", 502, "The selected AI provider could not complete this request.");
    }
  }

  const legacyModels: Record<string, string> = {
    "env:gpt-4.1-mini": "gpt-4.1-mini",
    "env:gpt-4.1": "gpt-4.1",
    "gpt-4.1-mini": "gpt-4.1-mini",
    "gpt-4.1": "gpt-4.1",
  };
  const model = legacyModels[modelChoice];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!model || !apiKey) {
    return safeError("AI_PROVIDER_NOT_CONFIGURED", 503, "The selected AI model is not configured. Ask the Super Admin to connect a provider.");
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: toOpenAIChatMessages(messages),
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    return safeError("AI_PROVIDER_UNAVAILABLE", 502, "The AI provider could not be reached. The reserved message allowance may appear in usage.");
  }

  if (!providerResponse.ok) {
    const providerStatus = providerResponse.status;
    if (providerStatus === 401 || providerStatus === 403) {
      return safeError("AI_PROVIDER_AUTH_FAILED", 503, "The server-side OpenAI credential is not accepted. Ask the administrator to check provider configuration.");
    }
    if (providerStatus === 429) return safeError("AI_PROVIDER_RATE_LIMITED", 503, "The AI provider is temporarily rate-limited. Please try again later.");
    return safeError("AI_PROVIDER_ERROR", 502, "The AI provider returned an error. Please try again later.");
  }

  try {
    const result = await providerResponse.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return safeError("EMPTY_AI_RESPONSE", 502, "The AI provider returned an empty response.");
    return NextResponse.json({ reply, model, provider: "openai" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return safeError("INVALID_AI_RESPONSE", 502, "The AI provider response could not be read.");
  }
}
