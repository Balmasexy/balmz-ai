import { buildGeminiTools } from "@/lib/ai/tool-capabilities.js";

type GeminiToolInput = {
  apiKey: string;
  model: string;
  prompt: string;
  tools: string[];
};

function safeGroundingSources(candidate: Record<string, unknown>) {
  const metadata = candidate.groundingMetadata && typeof candidate.groundingMetadata === "object"
    ? candidate.groundingMetadata as Record<string, unknown>
    : {};
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  const chunkSources = chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== "object") return [];
    const row = chunk as Record<string, unknown>;
    const web = row.web && typeof row.web === "object" ? row.web as Record<string, unknown> : null;
    if (web && typeof web.uri === "string" && web.uri.startsWith("https://")) {
      return [{ url: web.uri, title: typeof web.title === "string" ? web.title.slice(0, 160) : new URL(web.uri).hostname }];
    }
    const maps = row.maps && typeof row.maps === "object" ? row.maps as Record<string, unknown> : null;
    const mapsUrl = typeof maps?.uri === "string" ? maps.uri
      : typeof maps?.placeUri === "string" ? maps.placeUri
        : typeof maps?.googleMapsUri === "string" ? maps.googleMapsUri : "";
    if (maps && mapsUrl.startsWith("https://")) {
      return [{ url: mapsUrl, title: typeof maps.title === "string" ? maps.title.slice(0, 160) : "Google Maps place" }];
    }
    return [];
  });
  const urlContext = candidate.urlContextMetadata && typeof candidate.urlContextMetadata === "object"
    ? candidate.urlContextMetadata as Record<string, unknown>
    : {};
  const urlMetadata = Array.isArray(urlContext.urlMetadata) ? urlContext.urlMetadata : [];
  const urlSources = urlMetadata.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const url = typeof item.retrievedUrl === "string" ? item.retrievedUrl : "";
    if (!url.startsWith("https://")) return [];
    return [{ url, title: new URL(url).hostname }];
  });
  return [...new Map([...chunkSources, ...urlSources].map((item) => [item.url, item])).values()].slice(0, 25);
}

export async function runGeminiNativeTools(input: GeminiToolInput) {
  if (!input.apiKey.trim() || !input.model.trim() || !input.prompt.trim() || input.prompt.length > 12_000) {
    throw new Error("GEMINI_TOOL_REQUEST_INVALID");
  }
  const tools = buildGeminiTools(input.model, input.tools);
  if (!tools.length) throw new Error("GEMINI_TOOL_NOT_AVAILABLE");

  let response: Response;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(input.model) + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": input.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: input.prompt.trim() }] }],
          tools,
          generationConfig: { maxOutputTokens: 1800 },
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    throw new Error("GEMINI_TOOL_PROVIDER_UNAVAILABLE");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_TOOL_AUTH_FAILED");
    if (response.status === 429) throw new Error("GEMINI_TOOL_RATE_LIMITED");
    if (response.status === 400) throw new Error("GEMINI_TOOL_REQUEST_REJECTED");
    throw new Error("GEMINI_TOOL_PROVIDER_ERROR");
  }

  let payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: unknown }> }; groundingMetadata?: Record<string, unknown> }>;
    usageMetadata?: unknown;
  };
  try { payload = await response.json(); }
  catch { throw new Error("GEMINI_TOOL_RESPONSE_INVALID"); }
  const candidate = payload.candidates?.[0] ?? {};
  const parts = candidate.content?.parts ?? [];
  const text = parts.map((part) => typeof part.text === "string" ? part.text : "").join("\n").trim();
  const functionCalls = parts.flatMap((part) => part.functionCall ? [part.functionCall] : []);
  if (!text && !functionCalls.length) throw new Error("GEMINI_TOOL_EMPTY_RESPONSE");

  return {
    provider: "google",
    model: input.model,
    text,
    sources: safeGroundingSources(candidate as Record<string, unknown>),
    functionCalls,
    usage: payload.usageMetadata ?? null,
  };
}
