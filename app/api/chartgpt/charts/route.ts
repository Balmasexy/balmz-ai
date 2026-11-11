import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { getCurrentSubscription, consumeUsage } from "@/lib/subscriptions";
import {
  decryptServiceCredentials,
  serviceCredentialsFromEnvironment,
} from "@/lib/service-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChartRow = Record<string, string | number | boolean | null>;
type ChartFormat = "svg" | "png" | "json";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { prompt?: unknown; data?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const format: ChartFormat = body.format === "png" || body.format === "json" ? body.format : "svg";
  if (!prompt || prompt.length > 10_000) {
    return NextResponse.json({ error: "INVALID_PROMPT", message: "Enter a chart prompt under 10,000 characters." }, { status: 400 });
  }

  let data: ChartRow[] | undefined;
  if (body.data !== undefined) {
    if (!Array.isArray(body.data) || body.data.length < 1 || body.data.length > 500 ||
        !body.data.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
      return NextResponse.json({ error: "INVALID_CHART_DATA", message: "Chart data must contain 1–500 object rows." }, { status: 400 });
    }
    data = body.data as ChartRow[];
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 500_000) {
      return NextResponse.json({ error: "CHART_DATA_TOO_LARGE", message: "Chart data must be smaller than 500 KB." }, { status: 413 });
    }
  }

  let subscription;
  try {
    subscription = await getCurrentSubscription(session.user.id);
  } catch {
    return NextResponse.json({ error: "SUBSCRIPTION_UNAVAILABLE" }, { status: 503 });
  }
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return NextResponse.json({ error: "ACTIVE_PLAN_REQUIRED" }, { status: 402 });
  }

  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: "chartgpt",
      idempotencyKey: randomUUID(),
    });
  } catch {
    return NextResponse.json({ error: "AI_ALLOWANCE_UNAVAILABLE", message: "Your plan does not currently include an available ai_messages allowance." }, { status: 402 });
  }

  let apiKey = "";
  try {
    const connected = await getDbPool().query<{ encrypted_credentials: string }>(
      `SELECT encrypted_credentials
         FROM public.balmz_service_credentials
        WHERE service_id = 'chartgpt' AND environment = 'live' AND status = 'connected'
        ORDER BY last_tested_at DESC NULLS LAST
        LIMIT 1`,
    );
    if (connected.rows[0]) {
      apiKey = decryptServiceCredentials(connected.rows[0].encrypted_credentials).apiKey ?? "";
    } else {
      apiKey = serviceCredentialsFromEnvironment("chartgpt", "live")?.apiKey ?? "";
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "SERVICE_CONNECTOR_SCHEMA_REQUIRED", message: "Apply migration 0003 to enable ChartGPT." }, { status: 503 });
    }
    return NextResponse.json({ error: "CHARTGPT_CREDENTIALS_UNAVAILABLE" }, { status: 503 });
  }

  if (!apiKey) return NextResponse.json({
    error: "CHARTGPT_NOT_CONNECTED",
    message: "Connect a ChartGPT Team API key in Super Admin → Service connectors first.",
  }, { status: 503 });

  let response: Response;
  try {
    response = await fetch("https://api.chartgpt.co/v1/charts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ prompt, ...(data ? { data } : {}), format }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json({ error: "CHARTGPT_UNAVAILABLE", message: "ChartGPT could not be reached. Try again later." }, { status: 502 });
  }

  if (!response.ok) {
    const status = response.status;
    const code = status === 401 || status === 403 ? "CHARTGPT_KEY_REJECTED"
      : status === 429 ? "CHARTGPT_RATE_LIMITED"
      : status === 404 ? "CHARTGPT_ENDPOINT_NOT_AVAILABLE"
      : "CHARTGPT_REQUEST_FAILED";
    return NextResponse.json({
      error: code,
      message: status === 401 || status === 403
        ? "ChartGPT rejected the key. Confirm that API access is enabled for your Team account."
        : status === 429
          ? "ChartGPT rate limit reached. Try again later."
          : status === 404
            ? "ChartGPT API endpoint was not found. Confirm API entitlement and endpoint access."
            : "ChartGPT could not generate this chart.",
    }, { status: status === 429 ? 429 : 502 });
  }

  try {
    const result = await response.json() as { request_id?: string; spec?: unknown; file?: string };
    if (typeof result.request_id !== "string" || !result.spec) {
      return NextResponse.json({ error: "CHARTGPT_INVALID_RESPONSE" }, { status: 502 });
    }
    return NextResponse.json({
      requestId: result.request_id,
      spec: result.spec,
      file: typeof result.file === "string" ? result.file : null,
      format,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "CHARTGPT_INVALID_RESPONSE" }, { status: 502 });
  }
}
