import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";
import { isAdminUser } from "@/lib/admin";
import {
  decryptProviderKey,
  findAIProviderConnection,
  getAIProviderEnvironmentKey,
  listAIProviderConnections,
} from "@/lib/ai/providers";
import { getProviderToolCapabilities } from "@/lib/ai/tool-capabilities.js";
import { runOpenAIResponsesTools } from "@/lib/ai/openai-responses-tools";
import { runGeminiNativeTools } from "@/lib/ai/gemini-native-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

type ToolProviderOption = {
  id: string;
  provider: "openai" | "google";
  label: string;
  model: string;
  source: "connection" | "environment";
  connectionId?: string;
  capabilities: ReturnType<typeof getProviderToolCapabilities>;
};

function environmentModel(provider: "openai" | "google") {
  if (provider === "openai") {
    return process.env.OPENAI_RESPONSES_MODEL_ID?.trim()
      || process.env.OPENAI_MODEL_ID?.trim()
      || "gpt-6-astra";
  }
  return process.env.GEMINI_MODEL_ID?.trim() || "gemini-3.1-flash-lite";
}

async function availableProviders(): Promise<ToolProviderOption[]> {
  const options: ToolProviderOption[] = [];
  try {
    const connections = await listAIProviderConnections();
    for (const connection of connections) {
      if (!connection.enabled || connection.last_test_status !== "connected") continue;
      if (connection.provider_id !== "openai" && connection.provider_id !== "google") continue;
      const provider = connection.provider_id as "openai" | "google";
      options.push({
        id: "connection:" + connection.id,
        provider,
        label: connection.display_name + " · " + connection.model_id,
        model: connection.model_id,
        source: "connection",
        connectionId: connection.id,
        capabilities: getProviderToolCapabilities(provider, connection.model_id),
      });
    }
  } catch {
    // Environment credentials remain available when provider-connection storage is not installed.
  }

  for (const provider of ["openai", "google"] as const) {
    const key = getAIProviderEnvironmentKey(provider);
    const model = environmentModel(provider);
    if (!key || !model) continue;
    if (options.some((item) => item.provider === provider)) continue;
    options.push({
      id: "environment:" + provider,
      provider,
      label: model + " · " + (provider === "google" ? "Gemini" : "OpenAI") + " server key",
      model,
      source: "environment",
      capabilities: getProviderToolCapabilities(provider, model),
    });
  }
  return options;
}

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const providers = await availableProviders();
  return NextResponse.json({ providers }, { headers: noStore });
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  let body: { providerId?: unknown; prompt?: unknown; toolIds?: unknown; requestId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }

  if (typeof body.providerId !== "string" || typeof body.prompt !== "string" ||
      !body.prompt.trim() || body.prompt.length > 12_000 ||
      !Array.isArray(body.toolIds) || body.toolIds.length < 1 || body.toolIds.length > 6 ||
      !body.toolIds.every((item) => typeof item === "string" && /^[a-z_]{2,40}$/.test(item))) {
    return NextResponse.json({ error: "INVALID_TOOL_REQUEST", message: "Choose an AI provider, at least one available tool and a prompt under 12,000 characters." }, { status: 400, headers: noStore });
  }

  let isAdmin = false;
  try {
    isAdmin = await isAdminUser(session.user.id);
    if (!isAdmin) {
      const subscription = await getCurrentSubscription(session.user.id);
      if (!subscription || !["active", "trialing"].includes(subscription.status)) {
        return NextResponse.json({ error: "ACTIVE_PLAN_REQUIRED", message: "An active BALMZ AI plan is required to use AI tools." }, { status: 402, headers: noStore });
      }
    }
  } catch {
    return NextResponse.json({ error: "SUBSCRIPTION_UNAVAILABLE", message: "Your account allowance could not be verified. No AI provider request was sent." }, { status: 503, headers: noStore });
  }

  const providers = await availableProviders();
  const selected = providers.find((item) => item.id === body.providerId);
  if (!selected) return NextResponse.json({ error: "AI_TOOL_PROVIDER_UNAVAILABLE", message: "The selected AI provider connection is no longer available." }, { status: 503, headers: noStore });

  const requestedTools = body.toolIds as string[];
  const unavailable = requestedTools.filter((id) => !selected.capabilities.some((capability) => capability.id === id && capability.available));
  if (unavailable.length) {
    return NextResponse.json({
      error: "AI_TOOL_NOT_AVAILABLE",
      message: "These tools are unavailable for the selected model: " + unavailable.join(", "),
    }, { status: 400, headers: noStore });
  }

  let apiKey: string | null = null;
  try {
    if (selected.source === "connection" && selected.connectionId) {
      const connection = await findAIProviderConnection(selected.connectionId);
      if (!connection || connection.provider_id !== selected.provider) {
        return NextResponse.json({ error: "AI_TOOL_PROVIDER_UNAVAILABLE" }, { status: 503, headers: noStore });
      }
      apiKey = decryptProviderKey(connection.encrypted_api_key);
    } else {
      apiKey = getAIProviderEnvironmentKey(selected.provider);
    }
  } catch {
    return NextResponse.json({ error: "AI_TOOL_CREDENTIAL_UNAVAILABLE", message: "The saved provider credential could not be opened. Ask the Super Admin to reconnect it." }, { status: 503, headers: noStore });
  }
  if (!apiKey) return NextResponse.json({ error: "AI_TOOL_CREDENTIAL_UNAVAILABLE" }, { status: 503, headers: noStore });

  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)
    ? body.requestId
    : randomUUID();
  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: "ai_tools",
      idempotencyKey: requestId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
    if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
      return NextResponse.json({ error: "AI_ALLOWANCE_UNAVAILABLE", message: "Your plan does not have an available AI message allowance for this request." }, { status: 402, headers: noStore });
    }
    return NextResponse.json({ error: "USAGE_UNAVAILABLE", message: "The AI allowance could not be reserved. No provider request was sent." }, { status: 503, headers: noStore });
  }

  try {
    const result = selected.provider === "openai"
      ? await runOpenAIResponsesTools({
          apiKey,
          model: selected.model,
          prompt: body.prompt,
          tools: requestedTools,
          userId: session.user.id,
        })
      : await runGeminiNativeTools({
          apiKey,
          model: selected.model,
          prompt: body.prompt,
          tools: requestedTools,
        });
    await getDbPool().query(
      `INSERT INTO public.balmz_audit_events
         (id, actor_user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'ai_tool_request', 'ai_provider', $3, $4::jsonb)`,
      [randomUUID(), session.user.id, selected.id, JSON.stringify({ provider: selected.provider, model: selected.model, tools: requestedTools, requestId })],
    ).catch(() => undefined);
    return NextResponse.json({ ...result, requestId }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_TOOL_PROVIDER_ERROR";
    const status = code.endsWith("_RATE_LIMITED") ? 429
      : code.endsWith("_AUTH_FAILED") || code.endsWith("_CREDENTIAL_UNAVAILABLE") ? 503
        : code.endsWith("_REQUEST_REJECTED") || code === "AI_TOOL_REQUEST_INVALID" || code === "AI_TOOL_NOT_AVAILABLE" ? 400
          : 502;
    const safeCode = [
      "OPENAI_TOOL_PROVIDER_UNAVAILABLE", "OPENAI_TOOL_AUTH_FAILED",
      "OPENAI_TOOL_RATE_LIMITED", "OPENAI_TOOL_REQUEST_REJECTED",
      "OPENAI_TOOL_PROVIDER_ERROR", "OPENAI_TOOL_RESPONSE_INVALID",
      "OPENAI_TOOL_EMPTY_RESPONSE", "GEMINI_TOOL_PROVIDER_UNAVAILABLE",
      "GEMINI_TOOL_AUTH_FAILED", "GEMINI_TOOL_RATE_LIMITED",
      "GEMINI_TOOL_REQUEST_REJECTED", "GEMINI_TOOL_PROVIDER_ERROR",
      "GEMINI_TOOL_RESPONSE_INVALID", "GEMINI_TOOL_EMPTY_RESPONSE",
      "AI_TOOL_REQUEST_INVALID", "AI_TOOL_NOT_AVAILABLE",
    ].includes(code) ? code : "AI_TOOL_PROVIDER_ERROR";
    return NextResponse.json({ error: safeCode, message: "The selected provider could not complete this tool-enabled request." }, { status, headers: noStore });
  }
}
