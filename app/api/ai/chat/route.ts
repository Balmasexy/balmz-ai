import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

function safeError(code: string, status: number, message: string) {
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return safeError("UNAUTHORIZED", 401, "Sign in to use BALMZ AI.");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return safeError("AI_PROVIDER_NOT_CONFIGURED", 503, "The OpenAI provider key has not been configured on the server.");

  let body: unknown;
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 96_000) return safeError("REQUEST_TOO_LARGE", 413, "This conversation is too large. Start a new chat.");
    body = await request.json();
  } catch {
    return safeError("INVALID_JSON", 400, "The request body must be valid JSON.");
  }

  const candidate = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 20) {
    return safeError("INVALID_MESSAGES", 400, "Send between 1 and 20 recent messages.");
  }

  const messages: ChatMessage[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== "object") return safeError("INVALID_MESSAGE", 400, "A message is invalid.");
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || content.length > 12_000) {
      return safeError("INVALID_MESSAGE", 400, "Messages must contain valid user or assistant text.");
    }
    messages.push({ role, content: content.trim() });
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
      return safeError("AI_ALLOWANCE_UNAVAILABLE", 402, "Your plan does not currently include an available ai_messages allowance. Contact the workspace administrator.");
    }
    return safeError("USAGE_UNAVAILABLE", 503, "The usage allowance could not be reserved. No AI request was sent.");
  }

  const model = process.env.OPENAI_CHAT_MODEL === "gpt-4.1" ? "gpt-4.1" : "gpt-4.1-mini";
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
        messages,
        max_tokens: 1800,
        temperature: 0.7,
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
    return NextResponse.json({ reply, model }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return safeError("INVALID_AI_RESPONSE", 502, "The AI provider response could not be read.");
  }
}
