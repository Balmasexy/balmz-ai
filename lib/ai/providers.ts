import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getDbPool } from "@/lib/db";

export const AI_PROVIDERS = {
  openai: { label: "OpenAI", protocol: "openai", endpoint: "https://api.openai.com/v1/chat/completions" },
  anthropic: { label: "Anthropic Claude", protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages" },
  google: { label: "Google Gemini", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta" },
  xai: { label: "xAI Grok", protocol: "openai", endpoint: "https://api.x.ai/v1/chat/completions" },
  openrouter: { label: "OpenRouter", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
  deepseek: { label: "DeepSeek", protocol: "openai", endpoint: "https://api.deepseek.com/chat/completions" },
  groq: { label: "Groq", protocol: "openai", endpoint: "https://api.groq.com/openai/v1/chat/completions" },
  mistral: { label: "Mistral", protocol: "openai", endpoint: "https://api.mistral.ai/v1/chat/completions" },
  together: { label: "Together AI", protocol: "openai", endpoint: "https://api.together.xyz/v1/chat/completions" },
  fireworks: { label: "Fireworks AI", protocol: "openai", endpoint: "https://api.fireworks.ai/inference/v1/chat/completions" },
} as const;

export type AIProviderId = keyof typeof AI_PROVIDERS;
export type AIMessage = { role: "user" | "assistant"; content: string };
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
};

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AI_PROVIDERS, value);
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
): Promise<string> {
  const definition = AI_PROVIDERS[provider];
  let response: Response;

  try {
    if (definition.protocol === "anthropic") {
      response = await fetch(definition.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
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
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } else {
      response = await fetch(definition.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter" ? { "HTTP-Referer": process.env.BETTER_AUTH_URL || "https://balmz-ai.onrender.com", "X-Title": "BALMZ AI" } : {}),
        },
        body: JSON.stringify({
          model,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    }
  } catch {
    throw new Error("AI_PROVIDER_UNAVAILABLE");
  }

  if (!response.ok) throw new Error(errorCode(response.status));

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

export async function testAIProvider(provider: AIProviderId, apiKey: string, model: string): Promise<void> {
  await requestProvider(provider, apiKey, model, [
    { role: "user", content: "Reply with the single word: OK" },
  ], 12);
}

export async function sendAIProviderMessage(connection: AIProviderConnection, messages: AIMessage[]): Promise<string> {
  if (!connection.enabled) throw new Error("AI_PROVIDER_DISABLED");
  const apiKey = decryptProviderKey(connection.encrypted_api_key);
  return requestProvider(connection.provider_id, apiKey, connection.model_id, messages, 1800);
}

export async function listAIProviderConnections(): Promise<AIProviderConnection[]> {
  const result = await getDbPool().query<AIProviderConnection>(
    `SELECT id, provider_id, display_name, model_id, encrypted_api_key,
            enabled, last_test_status, last_tested_at, last_error_code
       FROM public.balmz_ai_provider_connections
      WHERE enabled = true
      ORDER BY provider_id ASC, display_name ASC`,
  );
  return result.rows;
}

export async function findAIProviderConnection(id: string): Promise<AIProviderConnection | null> {
  const result = await getDbPool().query<AIProviderConnection>(
    `SELECT id, provider_id, display_name, model_id, encrypted_api_key,
            enabled, last_test_status, last_tested_at, last_error_code
       FROM public.balmz_ai_provider_connections
      WHERE id = $1 AND enabled = true AND last_test_status = 'connected'
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}
