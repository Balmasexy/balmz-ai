import RunwayML from "@runwayml/sdk";

export function getRunwayClient(): RunwayML | null {
  const apiKey = process.env.RUNWAYML_API_SECRET?.trim();
  if (!apiKey) return null;

  return new RunwayML({
    apiKey,
    maxRetries: 1,
    timeout: 60_000,
    logLevel: "error",
  });
}

export function getRunwayPublicError(error: unknown): { code: string; message: string; status: number } {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;

  if (status === 401) {
    return {
      code: "RUNWAY_AUTH_FAILED",
      message: "Runway rejected the server API credential. Check the Runway project key configured in Render.",
      status: 503,
    };
  }
  if (status === 403) {
    return {
      code: "RUNWAY_ACCESS_DENIED",
      message: "Runway denied this request. Check project permissions, model access and API credit balance.",
      status: 503,
    };
  }
  if (status === 429) {
    return {
      code: "RUNWAY_RATE_LIMITED",
      message: "Runway is receiving too many requests. Wait briefly and try again.",
      status: 429,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "RUNWAY_REQUEST_REJECTED",
      message: "Runway rejected these generation settings. Try a clearer prompt or supported image/video options.",
      status: 400,
    };
  }
  if (status >= 500) {
    return {
      code: "RUNWAY_PROVIDER_UNAVAILABLE",
      message: "Runway is temporarily unavailable. Your media job could not be started or checked.",
      status: 502,
    };
  }
  return {
    code: "RUNWAY_REQUEST_FAILED",
    message: "Runway could not complete this request. Check the project configuration and try again.",
    status: 502,
  };
}
