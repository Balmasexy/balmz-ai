export type ProviderFailureDetails = {
  errorCode: string | null;
  errorType: string | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
  classification: "quota" | "rate_limit" | "provider_error";
};

function safeProviderToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 100);
  return /^[a-zA-Z0-9_.:-]+$/.test(normalized) ? normalized : null;
}

export function retryAfterSeconds(headers: Headers): number | null {
  const value = headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(86_400, Math.max(1, Math.ceil(seconds)));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(86_400, Math.max(1, Math.ceil((date - Date.now()) / 1000)));
}

/** Read only allowlisted metadata from an upstream error. Never return raw provider text. */
export async function inspectProviderFailure(response: Response): Promise<ProviderFailureDetails> {
  let providerError: Record<string, unknown> = {};
  try {
    const payload: unknown = await response.clone().json();
    if (payload && typeof payload === "object") {
      const nested = (payload as { error?: unknown }).error;
      if (nested && typeof nested === "object") providerError = nested as Record<string, unknown>;
    }
  } catch {
    // Providers may return an empty or non-JSON error body.
  }

  const errorCode = safeProviderToken(providerError.code);
  const errorType = safeProviderToken(providerError.type);
  const quotaSignal = [errorCode, errorType].some((value) =>
    value ? /insufficient[_-]?quota|billing[_-]?(hard[_-]?)?limit|quota[_-]?(exceeded|exhausted)/i.test(value) : false
  );
  const requestId = safeProviderToken(response.headers.get("x-request-id") ?? response.headers.get("request-id"));
  return {
    errorCode,
    errorType,
    requestId,
    retryAfterSeconds: retryAfterSeconds(response.headers),
    classification: response.status === 429
      ? quotaSignal ? "quota" : "rate_limit"
      : "provider_error",
  };
}

export function providerFailureMessage(details: ProviderFailureDetails): {
  code: string;
  message: string;
} {
  if (details.classification === "quota") {
    return {
      code: "AI_PROVIDER_QUOTA_EXCEEDED",
      message: "OpenAI reports that this API project's quota or billing limit has been reached. Check the OpenAI API billing and usage limits; retrying alone will not fix this.",
    };
  }
  if (details.classification === "rate_limit") {
    const wait = details.retryAfterSeconds;
    return {
      code: "AI_PROVIDER_RATE_LIMITED",
      message: wait
        ? `OpenAI rate limit reached. Please wait about ${wait} seconds before retrying.`
        : "OpenAI rate limit reached. Please wait briefly before retrying.",
    };
  }
  return {
    code: "AI_PROVIDER_ERROR",
    message: "OpenAI could not complete this request. Check the provider status and server diagnostics before retrying.",
  };
}
