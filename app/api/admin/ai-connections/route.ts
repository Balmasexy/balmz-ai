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
    endpointUrl: connection.endpoint_url,
  };
}

function migrationRequired() {
  return NextResponse.json({
    error: "AI_CONNECTION_SCHEMA_REQUIRED",
    message: "Apply db/migrations/0002_ai_provider_connections.sql to the BALMZ AI Neon database before connecting providers.",
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
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
    endpointUrl?: unknown;
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
      if (body.providerId === "general" && typeof body.endpointUrl !== "string") {
        return NextResponse.json({ error: "INVALID_ENDPOINT", message: "Enter the public HTTPS OpenAI-compatible API base URL." }, { status: 400 });
      }
      if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 10 || body.apiKey.length > 4096) {
        return NextResponse.json({ error: "INVALID_API_KEY", message: "Enter the provider API key before loading its models." }, { status: 400 });
      }
      const models = await listAIProviderModels(body.providerId, body.apiKey.trim(), typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : null);
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
        await testAIProvider(connection.provider_id, decryptProviderKey(connection.encrypted_api_key), connection.model_id, connection.endpoint_url);
        await getDbPool().query(
          `UPDATE public.balmz_ai_provider_connections
              SET last_test_status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now()
            WHERE id = $1`,
          [connection.id],
        );
        return NextResponse.json({ success: true, status: "connected" }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "AI_PROVIDER_TEST_FAILED";
        await getDbPool().query(
          `UPDATE public.balmz_ai_provider_connections
              SET last_test_status = 'failed', last_tested_at = now(), last_error_code = $2, updated_at = now()
            WHERE id = $1`,
          [connection.id, code.slice(0, 80)],
        );
        return NextResponse.json({
          error: code,
          message: "The saved provider could not complete a test request. Check the provider key, model ID, and provider account limits.",
        }, { status: 502 });
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
    if (body.providerId === "general" && typeof body.endpointUrl !== "string") {
      return NextResponse.json({ error: "INVALID_ENDPOINT", message: "Enter a public HTTPS OpenAI-compatible API base URL." }, { status: 400 });
    }

    const providerId = body.providerId;
    const endpointUrl = providerId === "general" ? (body.endpointUrl as string).trim() : null;
    const displayName = body.displayName.trim();
    const modelId = body.modelId.trim();
    const apiKey = body.apiKey.trim();

    // Verify the key/model pair before storing the encrypted credential.
    await testAIProvider(providerId, apiKey, modelId, endpointUrl);

    const id = randomUUID();
    const encrypted = encryptProviderKey(apiKey);
    const inserted = await getDbPool().query<AIProviderConnection>(
      `INSERT INTO public.balmz_ai_provider_connections
         (id, provider_id, display_name, model_id, encrypted_api_key, endpoint_url, enabled,
          last_test_status, last_tested_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'connected', now(), $7)
       RETURNING id, provider_id, display_name, model_id, encrypted_api_key, endpoint_url,
                 enabled, last_test_status, last_tested_at, last_error_code`,
      [id, providerId, displayName, modelId, encrypted, endpointUrl, auth.session.user.id],
    );

    await getDbPool().query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'ai_provider_connected', $3::jsonb)`,
      [randomUUID(), auth.session.user.id, JSON.stringify({ providerId, displayName, modelId, ...(endpointUrl ? { endpointUrl } : {}) })],
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
    const status = code.startsWith("AI_PROVIDER_") ? 502 : 503;
    return NextResponse.json({
      error: code,
      message: code === "AI_PROVIDER_AUTH_FAILED"
        ? "The provider rejected this API key. Check that the key is active and belongs to this provider."
        : code === "AI_PROVIDER_RATE_LIMITED"
          ? "The provider rate-limited the model catalogue request or test. Wait and try again."
          : code === "AI_PROVIDER_REQUEST_REJECTED"
            ? "The provider rejected the model catalogue request. Check key permissions and provider account access."
            : code === "AI_PROVIDER_UNAVAILABLE"
              ? "The provider could not be reached right now. Check the provider status and try again."
              : "The provider operation could not be completed. Check the server and provider configuration.",
    }, { status, headers: { "Cache-Control": "no-store" } });
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
