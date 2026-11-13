import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import {
  AI_PROVIDERS,
  encryptProviderKey,
  isAIProviderId,
  listAIProviderConnections,
  listAIProviderModels,
  testAIProvider,
  type AIProviderConnection,
} from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), session: null };
  if (!(await isAdminUser(session.user.id))) {
    return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), session: null };
  }
  return { response: null, session };
}

function publicConnection(connection: AIProviderConnection) {
  return {
    id: connection.id,
    providerId: connection.provider_id,
    providerName: AI_PROVIDERS[connection.provider_id].label,
    displayName: connection.display_name,
    modelId: connection.model_id,
    enabled: connection.enabled,
    status: connection.last_test_status,
    lastTestedAt: connection.last_tested_at,
    lastErrorCode: connection.last_error_code,
  };
}

function migrationRequired() {
  return NextResponse.json({
    error: "AI_CONNECTION_SCHEMA_REQUIRED",
    message: "Apply db/migrations/0002_ai_provider_connections.sql to the BALMZ AI Neon database before connecting providers.",
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function retryAfterSeconds(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("retryAfterSeconds" in error)) return undefined;
  const value = error.retryAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(86_400, Math.ceil(value))
    : undefined;
}

function rateLimitMessage(retryIn?: number, operation: "catalogue" | "test" = "catalogue"): string {
  const wait = retryIn
    ? ` Retry after approximately ${retryIn} second${retryIn === 1 ? "" : "s"}.`
    : " Wait for the provider's rate-limit window to reset before trying again.";
  return operation === "catalogue"
    ? "The provider is temporarily rate-limiting model catalogue requests for this key or account." + wait + " You can enter the exact model ID manually instead of repeatedly loading the catalogue."
    : "The provider is temporarily rate-limiting test requests for this key or account." + wait + " BALMZ AI has not saved a new connection or changed the last successful connection status.";
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  try {
    const connections = await listAIProviderConnections();
    return NextResponse.json({
      providers: Object.entries(AI_PROVIDERS).map(([id, provider]) => ({ id, name: provider.label })),
      connections: connections.map(publicConnection),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({
      error: "AI_CONNECTIONS_UNAVAILABLE",
      message: "AI provider connections could not be loaded. Check database connectivity.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response;

  let body: {
    action?: unknown;
    id?: unknown;
    providerId?: unknown;
    displayName?: unknown;
    modelId?: unknown;
    apiKey?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    if (body.action === "list-models") {
      if (!isAIProviderId(body.providerId)) {
        return NextResponse.json({ error: "INVALID_PROVIDER" }, { status: 400 });
      }
      if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 10 || body.apiKey.length > 4096) {
        return NextResponse.json({ error: "INVALID_API_KEY", message: "Enter the provider API key before loading its models." }, { status: 400 });
      }
      const models = await listAIProviderModels(body.providerId, body.apiKey.trim());
      return NextResponse.json({
        success: true,
        models,
        message: models.length ? null : "The provider returned no chat models for this key or account.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "test") {
      if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
        return NextResponse.json({ error: "INVALID_CONNECTION" }, { status: 400 });
      }
      const connections = await listAIProviderConnections();
      const connection = connections.find((item) => item.id === body.id);
      if (!connection) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404 });
      try {
        const { decryptProviderKey } = await import("@/lib/ai/providers");
        await testAIProvider(connection.provider_id, decryptProviderKey(connection.encrypted_api_key), connection.model_id);
        await getDbPool().query(
          `UPDATE public.balmz_ai_provider_connections
              SET last_test_status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now()
            WHERE id = $1`,
          [connection.id],
        );
        return NextResponse.json({ success: true, status: "connected" }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "AI_PROVIDER_TEST_FAILED";
        const rateLimited = code === "AI_PROVIDER_RATE_LIMITED";
        const retryIn = retryAfterSeconds(error);
        await getDbPool().query(
          `UPDATE public.balmz_ai_provider_connections
              SET last_test_status = CASE WHEN $2 THEN last_test_status ELSE 'failed' END,
                  last_tested_at = CASE WHEN $2 THEN last_tested_at ELSE now() END,
                  last_error_code = $3,
                  updated_at = now()
            WHERE id = $1`,
          [connection.id, rateLimited, code.slice(0, 80)],
        );
        const responseHeaders = new Headers({ "Cache-Control": "no-store" });
        if (retryIn) responseHeaders.set("Retry-After", String(retryIn));
        return NextResponse.json({
          error: code,
          retryAfterSeconds: retryIn,
          message: rateLimited
            ? rateLimitMessage(retryIn, "test")
            : "The saved provider could not complete a test request. Check the provider key, model ID, and provider account limits.",
        }, { status: rateLimited ? 429 : 502, headers: responseHeaders });
      }
    }

    if (!isAIProviderId(body.providerId)) return NextResponse.json({ error: "INVALID_PROVIDER" }, { status: 400 });
    if (typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 60) {
      return NextResponse.json({ error: "INVALID_DISPLAY_NAME", message: "Connection name must be 2–60 characters." }, { status: 400 });
    }
    if (typeof body.modelId !== "string" || body.modelId.trim().length < 2 || body.modelId.trim().length > 180) {
      return NextResponse.json({ error: "INVALID_MODEL_ID", message: "Enter the model ID exactly as shown by the provider." }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 10 || body.apiKey.length > 4096) {
      return NextResponse.json({ error: "INVALID_API_KEY", message: "Enter a valid provider API key." }, { status: 400 });
    }

    const providerId = body.providerId;
    const displayName = body.displayName.trim();
    const modelId = body.modelId.trim();
    const apiKey = body.apiKey.trim();

    // Verify the key/model pair before storing the encrypted credential.
    await testAIProvider(providerId, apiKey, modelId);

    const id = randomUUID();
    const encrypted = encryptProviderKey(apiKey);
    const inserted = await getDbPool().query<AIProviderConnection>(
      `INSERT INTO public.balmz_ai_provider_connections
         (id, provider_id, display_name, model_id, encrypted_api_key, enabled,
          last_test_status, last_tested_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, true, 'connected', now(), $6)
       RETURNING id, provider_id, display_name, model_id, encrypted_api_key,
                 enabled, last_test_status, last_tested_at, last_error_code`,
      [id, providerId, displayName, modelId, encrypted, auth.session.user.id],
    );

    await getDbPool().query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'ai_provider_connected', $3::jsonb)`,
      [randomUUID(), auth.session.user.id, JSON.stringify({ providerId, displayName, modelId })],
    ).catch(() => undefined);

    return NextResponse.json({ success: true, connection: publicConnection(inserted.rows[0]) }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "CONNECTION_ALREADY_EXISTS", message: "A connection with this provider and name already exists." }, { status: 409 });
    }
    const code = error instanceof Error ? error.message : "AI_CONNECTION_FAILED";
    const rateLimited = code === "AI_PROVIDER_RATE_LIMITED";
    const retryIn = retryAfterSeconds(error);
    const status = rateLimited ? 429 : code.startsWith("AI_PROVIDER_") ? 502 : 503;
    const message = rateLimited
      ? rateLimitMessage(retryIn, body.action === "list-models" ? "catalogue" : "test")
      : code === "AI_PROVIDER_AUTH_FAILED"
        ? "The provider rejected this API key. Check that the key is active and belongs to this provider."
        : code === "AI_PROVIDER_REQUEST_REJECTED"
          ? "The provider rejected the request. Check key permissions, the exact model ID, and provider account access."
          : code === "AI_PROVIDER_UNAVAILABLE"
            ? "The provider could not be reached right now. Check the provider status and try again."
            : "The provider operation could not be completed. Check the server and provider configuration.";
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    if (retryIn) responseHeaders.set("Retry-After", String(retryIn));
    return NextResponse.json({
      error: code,
      retryAfterSeconds: retryIn,
      message,
    }, { status, headers: responseHeaders });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
    return NextResponse.json({ error: "INVALID_CONNECTION" }, { status: 400 });
  }

  try {
    const result = await getDbPool().query(
      `DELETE FROM public.balmz_ai_provider_connections
        WHERE id = $1
        RETURNING id, provider_id, display_name, model_id`,
      [body.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404 });
    const connection = result.rows[0] as { provider_id: string; display_name: string; model_id: string };
    await getDbPool().query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'ai_provider_disconnected', $3::jsonb)`,
      [randomUUID(), auth.session?.user.id, JSON.stringify({
        providerId: connection.provider_id,
        displayName: connection.display_name,
        modelId: connection.model_id,
      })],
    ).catch(() => undefined);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "AI_CONNECTION_DELETE_FAILED", message: "The provider connection could not be removed." }, { status: 503 });
  }
}
