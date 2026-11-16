import { NextResponse } from "next/server";
import { authenticateBalmzApiKey, type AuthenticatedApiKey } from "@/lib/api-keys";
import { getWorldWalletGeminiBackendStatus } from "@/lib/integrations/world-wallet-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, type: string, code: string, status: number) {
  return NextResponse.json(
    { error: { message, type, param: null, code } },
    { status, headers: { "Cache-Control": "no-store", ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } },
  );
}

export async function GET(request: Request) {
  let apiKey: AuthenticatedApiKey | null = null;
  try {
    apiKey = await authenticateBalmzApiKey(request, "ai:models");
  } catch {
    return errorResponse("API authentication is temporarily unavailable.", "server_error", "api_auth_unavailable", 503);
  }
  if (!apiKey) {
    return errorResponse("A valid BALMZ API key with the ai:models scope is required.", "authentication_error", "invalid_api_key", 401);
  }
  if (!apiKey.createdByUserId) {
    return errorResponse("This API key is not linked to an active BALMZ AI account.", "permission_error", "api_key_owner_missing", 403);
  }

  const status = await getWorldWalletGeminiBackendStatus(apiKey.createdByUserId);
  if (!status.configured) {
    return errorResponse(status.message || "The BALMZ AI model is temporarily unavailable.", "server_error", status.code || "model_unavailable", 503);
  }

  return NextResponse.json({
    object: "list",
    data: [{
      id: "balmz-fast",
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "balmz-ai",
    }],
  }, { headers: { "Cache-Control": "no-store" } });
}
