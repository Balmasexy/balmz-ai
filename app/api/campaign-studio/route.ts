import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";
import {
  decryptProviderKey,
  getAIProviderEnvironmentKey,
  listAIProviderConnections,
} from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL_ID?.trim() || "gpt-image-2.5-flare";
const CAMPAIGN_PREFIX = "BALMZ Campaign Studio · ";

type CampaignVariant = { channel: string; headline: string; body: string; callToAction: string };
type CampaignResult = {
  title: string;
  concept: string;
  audienceInsight: string;
  keyMessage: string;
  variants: CampaignVariant[];
  launchChecklist: string[];
  imagePrompt: string;
};
type CampaignRecord = {
  id: string;
  requestId: string;
  brief: string;
  audience: string;
  productDetails: string;
  tone: string;
  channels: string[];
  result: CampaignResult;
  createdAt: string;
  imagePrompt: string;
  imageGenerated: boolean;
};

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function openAIConfiguration(): Promise<{ apiKey: string; model: string } | null> {
  try {
    const connections = await listAIProviderConnections();
    const saved = connections
      .filter((item) => item.provider_id === "openai" && item.enabled && item.last_test_status === "connected")
      .sort((a, b) => Date.parse(b.last_tested_at ?? "") - Date.parse(a.last_tested_at ?? ""));
    if (saved[0]) {
      return { apiKey: decryptProviderKey(saved[0].encrypted_api_key), model: saved[0].model_id };
    }
  } catch {
    // An environment-based OpenAI key remains a supported fallback.
  }
  const apiKey = getAIProviderEnvironmentKey("openai");
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_RESPONSES_MODEL_ID?.trim()
      || process.env.OPENAI_MODEL_ID?.trim()
      || "gpt-6-astra",
  };
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as { output_text?: unknown; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text.trim();
  return (root.output ?? [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part?.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function parseCampaign(value: string): CampaignResult {
  const cleaned = value.trim().replace(/^\uFEFF/, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("CAMPAIGN_RESPONSE_INVALID");
  const raw = JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
  const text = (key: string, max: number) => typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, max) : "";
  const variants = Array.isArray(raw.variants) ? raw.variants.slice(0, 3).flatMap((item): CampaignVariant[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const channel = typeof entry.channel === "string" ? entry.channel.trim().slice(0, 60) : "";
    const headline = typeof entry.headline === "string" ? entry.headline.trim().slice(0, 180) : "";
    const body = typeof entry.body === "string" ? entry.body.trim().slice(0, 1400) : "";
    const callToAction = typeof entry.callToAction === "string" ? entry.callToAction.trim().slice(0, 120) : "";
    return channel && headline && body ? [{ channel, headline, body, callToAction }] : [];
  }) : [];
  const launchChecklist = Array.isArray(raw.launchChecklist)
    ? raw.launchChecklist.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item) => item.trim().slice(0, 220))
    : [];
  const result: CampaignResult = {
    title: text("title", 120),
    concept: text("concept", 3000),
    audienceInsight: text("audienceInsight", 1200),
    keyMessage: text("keyMessage", 800),
    variants,
    launchChecklist,
    imagePrompt: text("imagePrompt", 1800),
  };
  if (!result.title || !result.concept || !result.audienceInsight || !result.keyMessage || variants.length !== 3 || launchChecklist.length < 3 || !result.imagePrompt) {
    throw new Error("CAMPAIGN_RESPONSE_INVALID");
  }
  return result;
}

async function callOpenAI(apiKey: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("OPENAI_UNAVAILABLE");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("OPENAI_AUTH_FAILED");
    if (response.status === 429) throw new Error("OPENAI_RATE_LIMITED");
    throw new Error("OPENAI_REQUEST_FAILED");
  }
  return await response.json() as unknown;
}

function safeUsageMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
  if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
    return jsonError("AI_ALLOWANCE_UNAVAILABLE", "Your active plan does not have enough AI message allowance for this action.", 402);
  }
  return jsonError("USAGE_UNAVAILABLE", "Your AI allowance could not be reserved. No provider request was sent.", 503);
}

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return jsonError("UNAUTHORIZED", "Sign in to open Campaign Studio.", 401);
  try {
    const result = await getDbPool().query<{ id: string; title: string; content: string; created_at: Date }>(
      `SELECT id, title, content, created_at
         FROM public.balmz_notes
        WHERE user_id = $1 AND title LIKE $2
        ORDER BY updated_at DESC
        LIMIT 12`,
      [session.user.id, CAMPAIGN_PREFIX + "%"],
    );
    const campaigns = result.rows.flatMap((row) => {
      try {
        const content = JSON.parse(row.content) as CampaignRecord;
        if (!content || content.id !== row.id || !content.result) return [];
        return [{
          id: row.id,
          title: row.title.slice(CAMPAIGN_PREFIX.length),
          brief: content.brief,
          audience: content.audience,
          productDetails: content.productDetails,
          tone: content.tone,
          channels: content.channels,
          result: content.result,
          createdAt: row.created_at.toISOString(),
          imageGenerated: false,
        }];
      } catch { return []; }
    });
    return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("CAMPAIGN_HISTORY_UNAVAILABLE", "Campaign history could not be loaded from your account.", 503);
  }
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return jsonError("UNAUTHORIZED", "Sign in to generate a campaign.", 401);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return jsonError("INVALID_JSON", "The request body must be valid JSON.", 400); }

  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const audience = typeof body.audience === "string" ? body.audience.trim() : "";
  const productDetails = typeof body.productDetails === "string" ? body.productDetails.trim() : "";
  const tone = typeof body.tone === "string" ? body.tone.trim() : "Clear and confident";
  const channels = Array.isArray(body.channels)
    ? body.channels.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8)
    : [];
  const generateImage = body.generateImage === true;
  const requestedId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : randomUUID();

  if (!brief || brief.length > 4000 || !audience || audience.length > 1200 || !productDetails || productDetails.length > 2400 ||
      tone.length < 2 || tone.length > 100 || !channels.length) {
    return jsonError("INVALID_BRIEF", "Add a campaign brief, target audience, product details, tone and at least one channel. Keep the brief under 4,000 characters.", 400);
  }

  let subscription;
  try { subscription = await getCurrentSubscription(session.user.id); }
  catch { return jsonError("SUBSCRIPTION_UNAVAILABLE", "Your plan could not be checked. No AI request was sent.", 503); }
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return jsonError("ACTIVE_PLAN_REQUIRED", "An active BALMZ AI plan is required to generate campaigns.", 402);
  }

  const configuration = await openAIConfiguration();
  if (!configuration) {
    return jsonError("OPENAI_NOT_CONFIGURED", "Connect and test an OpenAI provider in Super Admin → AI Connections, or configure OPENAI_API_KEY on the Render service. Campaign Studio uses the OpenAI Responses API.", 503);
  }

  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: "campaign_studio",
      idempotencyKey: requestedId + ":copy",
    });
  } catch (error) { return safeUsageMessage(error); }

  const instructions = [
    "You are the BALMZ AI Campaign Concept Studio for professional marketing teams.",
    "Create one coherent, usable campaign direction from the supplied brief.",
    "Return only a valid JSON object with exactly these fields: title, concept, audienceInsight, keyMessage, variants, launchChecklist, imagePrompt.",
    "variants must contain exactly three distinct channel-specific objects with fields channel, headline, body and callToAction.",
    "launchChecklist must contain 6 to 10 concise actionable launch tasks.",
    "imagePrompt must be a detailed, brand-safe visual-generation prompt that contains no text-rendering instructions unless the brief explicitly requests text in the image.",
    "Do not invent product capabilities, prices, statistics, testimonials, awards, customer results, guarantees or legal claims. Use only facts supplied in the brief; mark unknown claims as items to verify before launch.",
    "Keep copy specific to the stated audience, tone and requested channels. Do not include private reasoning or markdown fences.",
  ].join("\n");
  const input = [
    "Campaign brief: " + brief,
    "Target audience: " + audience,
    "Product or service details: " + productDetails,
    "Tone: " + tone,
    "Channels: " + channels.join(", "),
    "Return the requested JSON campaign object now.",
  ].join("\n\n");

  let result: CampaignResult;
  try {
    const raw = await callOpenAI(configuration.apiKey, {
      model: configuration.model,
      instructions,
      input,
      max_output_tokens: 2600,
      store: false,
      safety_identifier: createHash("sha256").update("balmz-campaign:" + session.user.id).digest("hex"),
    });
    result = parseCampaign(extractOutputText(raw));
  } catch (error) {
    const code = error instanceof Error ? error.message : "CAMPAIGN_GENERATION_FAILED";
    const status = code === "OPENAI_AUTH_FAILED" ? 503 : code === "OPENAI_RATE_LIMITED" ? 429 : 502;
    const message = code === "OPENAI_AUTH_FAILED" ? "OpenAI rejected the connected API key. Reconnect it in AI Connections."
      : code === "OPENAI_RATE_LIMITED" ? "OpenAI rate limit reached. Check the provider account and retry after its reset window."
      : code === "OPENAI_UNAVAILABLE" ? "OpenAI could not be reached. Try again later."
      : code === "CAMPAIGN_RESPONSE_INVALID" ? "OpenAI did not return a valid campaign structure. Retry with a clearer brief."
      : "The campaign could not be generated. Check the OpenAI model access and provider configuration.";
    return jsonError(code, message, status);
  }

  const campaignId = randomUUID();
  let imageDataUrl: string | null = null;
  let imageError: string | null = null;
  if (generateImage) {
    try {
      await consumeUsage({
        userId: session.user.id,
        metric: "ai_messages",
        units: 1,
        source: "campaign_studio_image",
        idempotencyKey: requestedId + ":image",
      });
      const rawImage = await callOpenAI(configuration.apiKey, {
        model: configuration.model,
        input: "Generate a campaign key visual for this brief. Follow this image prompt precisely. Do not add logos, brand marks or visible text unless explicitly described. Prompt: " + result.imagePrompt,
        tools: [{ type: "image_generation", model: IMAGE_MODEL, size: "1024x1024", quality: "medium", output_format: "png" }],
        tool_choice: { type: "image_generation" },
        max_output_tokens: 1200,
        store: false,
        safety_identifier: createHash("sha256").update("balmz-campaign:" + session.user.id).digest("hex"),
      }) as { output?: Array<{ type?: string; result?: string; status?: string }> };
      const generated = (raw.output ?? []).find((item) => item.type === "image_generation_call" && typeof item.result === "string" && item.result.length > 100);
      if (!generated?.result) throw new Error("IMAGE_NOT_RETURNED");
      imageDataUrl = "data:image/png;base64," + generated.result;
    } catch (error) {
      const code = error instanceof Error ? error.message : "IMAGE_GENERATION_FAILED";
      imageError = code === "OPENAI_RATE_LIMITED" ? "OpenAI image generation is rate-limited."
        : code === "OPENAI_AUTH_FAILED" ? "OpenAI rejected the image-generation credential."
        : code === "USAGE_LIMIT_EXCEEDED" || code === "USAGE_LIMIT_NOT_CONFIGURED" ? "Your plan does not have an additional image-generation allowance."
        : "The campaign copy was generated, but the image could not be generated. The image prompt is ready to use.";
    }
  }

  const createdAt = new Date().toISOString();
  const record: CampaignRecord = {
    id: campaignId,
    requestId: requestedId,
    brief,
    audience,
    productDetails,
    tone,
    channels,
    result,
    createdAt,
    imagePrompt: result.imagePrompt,
    imageGenerated: Boolean(imageDataUrl),
  };
  try {
    await getDbPool().query(
      `INSERT INTO public.balmz_notes (id, user_id, title, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [campaignId, session.user.id, CAMPAIGN_PREFIX + result.title.slice(0, 140), JSON.stringify(record)],
    );
  } catch {
    return jsonError("CAMPAIGN_SAVE_FAILED", "The campaign was generated, but it could not be saved to your account. Your copy and prompt were not discarded; retry generation after checking database access.", 503);
  }

  return NextResponse.json({
    campaign: { id: campaignId, ...record, imageDataUrl, imageError },
    usage: { textUnits: 1, imageUnits: generateImage && !imageError ? 1 : 0 },
  }, { headers: { "Cache-Control": "no-store" } });
}
