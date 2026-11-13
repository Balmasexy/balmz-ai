import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDbPool } from "@/lib/db";

export const AI_PROVIDERS = {
  openai: { label: "ChatGPT / OpenAI", protocol: "openai", endpoint: "https://api.openai.com/v1/chat/completions" },
  anthropic: { label: "Anthropic Claude", protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages" },
  google: { label: "Google Gemini", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta" },
  xai: { label: "xAI Grok", protocol: "openai", endpoint: "https://api.x.ai/v1/chat/completions" },
  openrouter: { label: "OpenRouter", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
  deepseek: { label: "DeepSeek", protocol: "openai", endpoint: "https://api.deepseek.com/chat/completions" },
  groq: { label: "Groq", protocol: "openai", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
  mistral: { label: "Mistral", protocol: "openai", endpoint: "https://api.mistral.ai/v1/chat/completions" },
  together: { label: "Together AI", protocol: "openai", endpoint: "https://api.together.xyz/v1/chat/completions" },
  fireworks: { label: "Fireworks AI", protocol: "openai", endpoint: "https://api.fireworks.ai/inference/v1/chat/completions" },
  general: { label: "General Language API", protocol: "openai", endpoint: "" },
} as const;

export type AIProviderId = keyof typeof AI_PROVIDERS;

const AI_PROVIDER_ENV_ALIASES: Record<AIProviderId, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  groq: ["GROQ_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  general: ["GENERAL_LANGUAGE_API_KEY"],
};

/** Resolve only server-side environment credentials. Never return the value to a client. */
export function getAIProviderEnvironmentKey(provider: AIProviderId): string | null {
  for (const name of AI_PROVIDER_ENV_ALIASES[provider]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function getAIProviderEnvironmentSource(provider: AIProviderId): string | null {
  return AI_PROVIDER_ENV_ALIASES[provider].find((name) => Boolean(process.env[name]?.trim())) ?? null;
}

export function getGeneralLanguageEnvironmentConfig() {
  return {
    apiKey: process.env.GENERAL_LANGUAGE_API_KEY?.trim() || null,
    baseUrl: process.env.GENERAL_LANGUAGE_API_BASE_URL?.trim() || null,
    modelId: process.env.GENERAL_LANGUAGE_API_MODEL?.trim() || null,
  };
}

export function listAIProviderEnvironmentStatus() {
  return Object.entries(AI_PROVIDERS).map(([id, definition]) => {
    const providerId = id as AIProviderId;
    const source = getAIProviderEnvironmentSource(providerId);
    const general = providerId === "general" ? getGeneralLanguageEnvironmentConfig() : null;
    const configured = providerId === "general" ? Boolean(general?.apiKey && general?.baseUrl && general?.modelId) : Boolean(source);
    return {
      providerId,
      providerName: definition.label,
      configured,
      source: configured ? "Render environment" : null,
      defaultModelId: general?.modelId ?? null,
    };
  });
}
export type AIImageAttachment = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
};
export type AIMessage = { role: "system" | "user" | "assistant"; content: string; images?: AIImageAttachment[] };

export function toOpenAIChatMessages(messages: AIMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.images?.length
      ? [
          { type: "text", text: message.content || "Please analyze the attached image(s)." },
          ...message.images.map((image) => ({
            type: "image_url",
            image_url: {
              url: "data:" + image.mimeType + ";base64," + image.dataBase64,
              detail: "auto",
            },
          })),
        ]
      : message.content,
  }));
}
export type AIProviderConnection = {
  id: string;
  provider_id: AIProviderId;
  display_name: string;
  model_id: string;
  encrypted_api_key: string;
  enabled: boolean;
  last_test_status: "untested" | "connected" | "failed";
  last_tested_at: string | null;
  last_error_code: string | null;
  endpoint_url: string | null;
};

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AI_PROVIDERS, value);
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPublicIP(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPublicIP(normalized.slice(7));
  // Accept only global-unicast IPv6 (2000::/3); reject documentation space.
  return /^[23][0-9a-f]{3}:/i.test(normalized) && !normalized.startsWith("2001:db8:");
}

/** Validate the server-configured OpenAI-compatible endpoint and reject private destinations. */
export async function normalizeGeneralLanguageBaseUrl(value: string): Promise<string> {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("AI_PROVIDER_ENDPOINT_INVALID"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("AI_PROVIDER_ENDPOINT_INVALID");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("AI_PROVIDER_ENDPOINT_PRIVATE");
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("AI_PROVIDER_ENDPOINT_UNAVAILABLE"); }
  if (!addresses.length || addresses.some((item) => !isPublicIP(item.address))) {
    throw new Error("AI_PROVIDER_ENDPOINT_PRIVATE");
  }
  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/chat/completions")) pathname = pathname.slice(0, -"/chat/completions".length);
  if (pathname.endsWith("/models")) pathname = pathname.slice(0, -"/models".length);
  return (`${url.origin}${pathname}`).replace(/\/$/, "");
}

async function generalLanguageEndpoint(baseUrl: string | null | undefined, resource: "models" | "chat/completions"): Promise<string> {
  if (!baseUrl) throw new Error("AI_PROVIDER_ENDPOINT_NOT_CONFIGURED");
  return `${await normalizeGeneralLanguageBaseUrl(baseUrl)}/${resource}`;
}

function encryptionKey(): Buffer {
  const masterSecret = process.env.BETTER_AUTH_SECRET;
  if (!masterSecret || masterSecret.length < 32) {
    throw new Error("AI_CONNECTOR_ENCRYPTION_UNAVAILABLE");
  }
  return scryptSync(masterSecret, "balmz-ai-provider-credentials-v1", 32);
}

export function encryptProviderKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("balmz-ai-provider-key-v1"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptProviderKey(value: string): string {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("AI_CONNECTOR_CREDENTIAL_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from("balmz-ai-provider-key-v1"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function errorCode(status: number): string {
  if (status === 401 || status === 403) return "AI_PROVIDER_AUTH_FAILED";
  if (status === 429) return "AI_PROVIDER_RATE_LIMITED";
  if (status >= 500) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_PROVIDER_REQUEST_REJECTED";
}

function providerRetryAfterSeconds(headers: Headers): number | undefined {
  const value = headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(86_400, Math.max(1, Math.ceil(seconds)));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(86_400, Math.max(1, Math.ceil((date - Date.now()) / 1000)));
}

function providerResponseError(response: Response): Error {
  const error = new Error(errorCode(response.status)) as Error & { retryAfterSeconds?: number };
  if (response.status === 429) {
    error.retryAfterSeconds = providerRetryAfterSeconds(response.headers);
  }
  return error;
}

function extractOpenAIText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const choices = (value as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "").join("").trim();
  }
  return "";
}

async function requestProvider(
  provider: AIProviderId,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  maxTokens: number,
  baseUrl?: string | null,
): Promise<string> {
  const definition = AI_PROVIDERS[provider];
  const completionEndpoint = provider === "general"
    ? await generalLanguageEndpoint(baseUrl, "chat/completions")
    : definition.endpoint;
  let response: Response;

  try {
    if (definition.protocol === "anthropic") {
      response = await fetch(completionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") || undefined,
          messages: messages.filter((message) => message.role !== "system").map((message) => ({
            role: message.role,
            content: message.images?.length
              ? [
                  { type: "text", text: message.content || "Please analyze the attached image(s)." },
                  ...message.images.map((image) => ({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mimeType,
                      data: image.dataBase64,
                    },
                  })),
                ]
              : message.content,
          })),
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } else if (definition.protocol === "gemini") {
      const url = `${definition.endpoint}/models/${encodeURIComponent(model)}:generateContent`;
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: messages.some((message) => message.role === "system")
            ? { parts: [{ text: messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") }] }
            : undefined,
          contents: messages.filter((message) => message.role !== "system").map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [
              ...(message.content ? [{ text: message.content }] : []),
              ...(message.images ?? []).map((image) => ({
                inline_data: { mime_type: image.mimeType, data: image.dataBase64 },
              })),
              ...(!message.content && !message.images?.length
                ? [{ text: "Please analyze the attached image(s)." }]
                : []),
            ],
          })),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } else {
      response = await fetch(completionEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter" ? { "HTTP-Referer": process.env.BETTER_AUTH_URL || "https://balmz-ai.onrender.com", "X-Title": "BALMZ AI" } : {}),
        },
        redirect: "error",
        body: JSON.stringify({
          model,
          messages: toOpenAIChatMessages(messages),
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    }
  } catch {
    throw new Error("AI_PROVIDER_UNAVAILABLE");
  }

  if (!response.ok) throw providerResponseError(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AI_PROVIDER_INVALID_RESPONSE");
  }

  let reply = "";
  if (definition.protocol === "anthropic") {
    const content = (payload as { content?: Array<{ type?: string; text?: string }> }).content;
    reply = content?.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("").trim() ?? "";
  } else if (definition.protocol === "gemini") {
    const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
    reply = candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  } else {
    reply = extractOpenAIText(payload);
  }

  if (!reply) throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
  return reply.slice(0, 40_000);
}

export async function testAIProvider(provider: AIProviderId, apiKey: string, model: string, baseUrl?: string | null): Promise<void> {
  await requestProvider(provider, apiKey, model, [
    { role: "user", content: "Reply with the single word: OK" },
  ], 12, baseUrl);
}

export type AIProviderModelOption = { id: string; label: string };

const AI_MODEL_ENDPOINTS: Record<AIProviderId, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
  google: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
  xai: "https://api.x.ai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  deepseek: "https://api.deepseek.com/models",
  groq: "https://api.groq.com/openai/v1/models",
  mistral: "https://api.mistral.ai/v1/models",
  together: "https://api.together.xyz/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
  general: "",
};

/**
 * Fetch the provider's live model catalogue using the unsaved key supplied by
 * the Super Admin. Keys are sent only to this server route and are never saved
 * by this operation. Only fixed provider endpoints are contacted.
 */
export async function listAIProviderModels(
  provider: AIProviderId,
  apiKey: string,
  baseUrl?: string | null,
): Promise<AIProviderModelOption[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider === "google") {
    headers["x-goog-api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const catalogueEndpoint = provider === "general"
    ? await generalLanguageEndpoint(baseUrl, "models")
    : AI_MODEL_ENDPOINTS[provider];
  let response: Response;
  try {
    response = await fetch(catalogueEndpoint, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("AI_PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) throw providerResponseError(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AI_PROVIDER_INVALID_RESPONSE");
  }

  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const rawItems = provider === "google"
    ? Array.isArray(root.models) ? root.models : []
    : Array.isArray(root.data) ? root.data
      : Array.isArray(root.models) ? root.models : [];

  const models = rawItems.flatMap((item): AIProviderModelOption[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (provider === "google") {
      const methods = Array.isArray(row.supportedGenerationMethods)
        ? row.supportedGenerationMethods.filter((method): method is string => typeof method === "string")
        : [];
      if (methods.length && !methods.includes("generateContent")) return [];
    }
    const rawId = typeof row.id === "string"
      ? row.id
      : typeof row.name === "string" ? row.name : "";
    const id = (provider === "google" ? rawId.replace(/^models\//, "") : rawId).trim();
    if (!id || id.length > 180 || /[\r\n]/.test(id)) return [];
    // The chat adapter supports text generation, not embeddings, audio,
    // moderation, image generation, transcription or reranking endpoints.
    if (/(^|[-/.])(embedding|embeddings|embed|moderation|whisper|transcribe|transcription|tts|speech|dall-e|image|rerank|audio|realtime)([-/.]|$)/i.test(id)) return [];
    const label = typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim().slice(0, 180)
      : typeof row.name === "string" && provider !== "google" && row.name.trim()
        ? row.name.trim().slice(0, 180)
        : id;
    return [{ id, label }];
  });

  const unique = new Map<string, AIProviderModelOption>();
  for (const model of models) unique.set(model.id, model);
  return [...unique.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 150);
}

export async function sendAIProviderMessage(connection: AIProviderConnection, messages: AIMessage[]): Promise<string> {
  if (!connection.enabled) throw new Error("AI_PROVIDER_DISABLED");
  const apiKey = decryptProviderKey(connection.encrypted_api_key);
  return requestProvider(connection.provider_id, apiKey, connection.model_id, messages, 1800, connection.endpoint_url);
}

export async function listAIProviderConnections(): Promise<AIProviderConnection[]> {
  try {
    const result = await getDbPool().query<AIProviderConnection>(
      `SELECT id, provider_id, display_name, model_id, encrypted_api_key, endpoint_url,
              enabled, last_test_status, last_tested_at, last_error_code
         FROM public.balmz_ai_provider_connections
        WHERE enabled = true
        ORDER BY provider_id ASC, display_name ASC`,
    );
    return result.rows;
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "42703") throw error;
    const result = await getDbPool().query<Omit<AIProviderConnection, "endpoint_url">>(
      `SELECT id, provider_id, display_name, model_id, encrypted_api_key,
              enabled, last_test_status, last_tested_at, last_error_code
         FROM public.balmz_ai_provider_connections
        WHERE enabled = true AND provider_id <> 'general'
        ORDER BY provider_id ASC, display_name ASC`,
    );
    return result.rows.map((row) => ({ ...row, endpoint_url: null }));
  }
}

export async function findAIProviderConnection(id: string): Promise<AIProviderConnection | null> {
  try {
    const result = await getDbPool().query<AIProviderConnection>(
      `SELECT id, provider_id, display_name, model_id, encrypted_api_key, endpoint_url,
              enabled, last_test_status, last_tested_at, last_error_code
         FROM public.balmz_ai_provider_connections
        WHERE id = $1 AND enabled = true AND last_test_status = 'connected'
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "42703") throw error;
    const result = await getDbPool().query<Omit<AIProviderConnection, "endpoint_url">>(
      `SELECT id, provider_id, display_name, model_id, encrypted_api_key,
              enabled, last_test_status, last_tested_at, last_error_code
         FROM public.balmz_ai_provider_connections
        WHERE id = $1 AND enabled = true AND last_test_status = 'connected'
          AND provider_id <> 'general'
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? { ...result.rows[0], endpoint_url: null } : null;
  }
}
