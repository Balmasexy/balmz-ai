import { NextResponse } from "next/server";
import { authenticateBalmzApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let key;
  try {
    key = await authenticateBalmzApiKey(request, "platform:read");
  } catch {
    return NextResponse.json({ error: "API_KEY_VALIDATION_UNAVAILABLE" }, { status: 503 });
  }
  if (!key) return NextResponse.json({
    error: "INVALID_API_KEY",
    message: "Provide an active BALMZ API key with the platform:read scope.",
  }, { status: 401 });

  return NextResponse.json({
    ok: true,
    service: "BALMZ AI",
    environment: key.environment,
    authenticated: true,
    keyName: key.name,
    checkedAt: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-BALMZ-Environment": key.environment,
    },
  });
}
