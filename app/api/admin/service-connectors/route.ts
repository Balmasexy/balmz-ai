import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import {
  checkStoredServiceCredential,
  encryptServiceCredentials,
  getServiceSecretStatus,
  serviceCredentialsFromEnvironment,
  publicServiceCatalog,
  SERVICE_CATALOG,
  testServiceConnection,
  type ServiceCredentials,
  type ServiceEnvironment,
  type ServiceId,
} from "@/lib/service-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), session: null };
  if (!(await isAdminUser(session.user.id))) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), session: null };
  return { response: null, session };
}

function publicEntry(row: {
  id: string;
  service_id: ServiceId;
  display_name: string;
  environment: ServiceEnvironment;
  status: string;
  last_tested_at: string | null;
  last_error_code: string | null;
}) {
  const service = SERVICE_CATALOG.find((item) => item.id === row.service_id);
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: service?.name ?? row.service_id,
    displayName: row.display_name,
    environment: row.environment,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastErrorCode: row.last_error_code,
  };
}

function migrationRequired() {
  return NextResponse.json({
    error: "SERVICE_CONNECTOR_SCHEMA_REQUIRED",
    message: "Apply db/migrations/0003_api_keys_integrations_and_payments.sql to the BALMZ AI Neon database first.",
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function credentialsValid(serviceId: ServiceId, input: unknown): input is ServiceCredentials {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const credentials = input as Record<string, unknown>;
  const allowed = serviceId === "github" || serviceId === "render" || serviceId === "neon" || serviceId === "notion"
    ? ["token"]
    : serviceId === "paystack"
      ? ["secretKey", "publicKey"]
      : serviceId === "coingecko" || serviceId === "chartgpt"
        ? ["apiKey"]
        : serviceId === "notes-ai" || serviceId === "custom"
          ? ["baseUrl", "apiKey", "modelId"]
          : [];
  return Object.entries(credentials).every(([key, value]) =>
    allowed.includes(key) && typeof value === "string" && value.length <= 4096,
  );
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  try {
    const result = await getDbPool().query<{
      id: string;
      service_id: ServiceId;
      display_name: string;
      environment: ServiceEnvironment;
      status: string;
      last_tested_at: string | null;
      last_error_code: string | null;
    }>(
      `SELECT id, service_id, display_name, environment, status, last_tested_at, last_error_code
         FROM public.balmz_service_credentials
        ORDER BY service_id, environment, display_name`,
    );
    const saved = result.rows.map(publicEntry);
    const environmentStatuses = SERVICE_CATALOG.flatMap((service) =>
      (service.demoLive ? ["demo", "live"] as const : ["live"] as const).map((environment) => ({
        serviceId: service.id,
        environment,
        ...getServiceSecretStatus(service.id, environment),
      })),
    );
    return NextResponse.json({
      catalog: publicServiceCatalog(),
      connections: saved,
      environmentStatuses,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "SERVICE_CONNECTORS_UNAVAILABLE", message: "Service connections could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response;
  let body: { action?: unknown; id?: unknown; serviceId?: unknown; environment?: unknown; displayName?: unknown; credentials?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  try {
    if (body.action === "test-environment") {
      const service = SERVICE_CATALOG.find((item) => item.id === body.serviceId);
      if (!service) return NextResponse.json({ error: "UNKNOWN_SERVICE" }, { status: 400 });
      const environment: ServiceEnvironment = body.environment === "demo" ? "demo" : "live";
      const credentials = serviceCredentialsFromEnvironment(service.id, environment);
      if (!credentials) return NextResponse.json({
        error: "ENVIRONMENT_SECRET_NOT_FOUND",
        message: "No matching service credential was found in the Render environment. Add the documented environment variable or connect a key here.",
      }, { status: 404 });
      const result = await testServiceConnection(service.id, credentials, environment);
      return NextResponse.json({
        success: true,
        status: "connected",
        source: "Render environment",
        details: result,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "connect-environment") {
      const service = SERVICE_CATALOG.find((item) => item.id === body.serviceId);
      if (!service) return NextResponse.json({ error: "UNKNOWN_SERVICE" }, { status: 400 });
      const environment: ServiceEnvironment = service.demoLive && body.environment === "demo" ? "demo" : "live";
      const credentials = serviceCredentialsFromEnvironment(service.id, environment) ?? (service.keyRequired ? null : {});
      if (!credentials) {
        return NextResponse.json({
          error: "ENVIRONMENT_SECRET_NOT_FOUND",
          message: "No matching server-side environment secret is configured for this service. Add it once in Render, then refresh this connector list.",
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      if (typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 60) {
        return NextResponse.json({ error: "INVALID_DISPLAY_NAME" }, { status: 400 });
      }

      const testDetails = await testServiceConnection(service.id, credentials, environment);
      const id = randomUUID();
      const encrypted = encryptServiceCredentials(credentials);
      const result = await getDbPool().query<{
        id: string; service_id: ServiceId; display_name: string; environment: ServiceEnvironment;
        status: string; last_tested_at: string | null; last_error_code: string | null;
      }>(
        `INSERT INTO public.balmz_service_credentials
           (id, service_id, display_name, environment, encrypted_credentials, status, last_tested_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'connected', now(), $6)
         ON CONFLICT (service_id, environment, display_name)
         DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials,
                       status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now()
         RETURNING id, service_id, display_name, environment, status, last_tested_at, last_error_code`,
        [id, service.id, body.displayName.trim(), environment, encrypted, auth.session.user.id],
      );
      await getDbPool().query(
        `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
         VALUES ($1, $2, 'service_connector_connected_from_environment', $3::jsonb)`,
        [randomUUID(), auth.session.user.id, JSON.stringify({ serviceId: service.id, environment, source: "Render environment" })],
      ).catch(() => undefined);

      return NextResponse.json({
        success: true,
        source: "Render environment",
        testDetails,
        connection: publicEntry(result.rows[0]),
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "test") {
      if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
        return NextResponse.json({ error: "INVALID_CONNECTION" }, { status: 400 });
      }
      const result = await getDbPool().query<{
        id: string; service_id: ServiceId; environment: ServiceEnvironment; encrypted_credentials: string;
      }>(
        "SELECT id, service_id, environment, encrypted_credentials FROM public.balmz_service_credentials WHERE id = $1 LIMIT 1",
        [body.id],
      );
      const row = result.rows[0];
      if (!row) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404 });
      await checkStoredServiceCredential(row.encrypted_credentials, row.service_id, row.environment);
      await getDbPool().query(
        `UPDATE public.balmz_service_credentials SET status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now() WHERE id = $1`,
        [row.id],
      );
      return NextResponse.json({ success: true, status: "connected" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action !== "connect") return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
    const service = SERVICE_CATALOG.find((item) => item.id === body.serviceId);
    if (!service) return NextResponse.json({ error: "UNKNOWN_SERVICE" }, { status: 400 });
    const environment: ServiceEnvironment = body.environment === "live" ? "live" : "demo";
    if (!service.demoLive && environment !== "live") {
      return NextResponse.json({ error: "ENVIRONMENT_NOT_SUPPORTED" }, { status: 400 });
    }
    if (typeof body.displayName !== "string" || body.displayName.trim().length < 2 || body.displayName.trim().length > 60) {
      return NextResponse.json({ error: "INVALID_DISPLAY_NAME" }, { status: 400 });
    }
    if (!credentialsValid(service.id, body.credentials)) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }
    const credentials = body.credentials as ServiceCredentials;

    // For the Agentic.ai public directory, no credential is required. Other entries must pass a live read-only test.
    await testServiceConnection(service.id, credentials, environment);

    const id = randomUUID();
    const encrypted = encryptServiceCredentials(credentials);
    const result = await getDbPool().query<{
      id: string; service_id: ServiceId; display_name: string; environment: ServiceEnvironment;
      status: string; last_tested_at: string | null; last_error_code: string | null;
    }>(
      `INSERT INTO public.balmz_service_credentials
         (id, service_id, display_name, environment, encrypted_credentials, status, last_tested_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'connected', now(), $6)
       ON CONFLICT (service_id, environment, display_name)
       DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials,
                     status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now()
       RETURNING id, service_id, display_name, environment, status, last_tested_at, last_error_code`,
      [id, service.id, body.displayName.trim(), environment, encrypted, auth.session.user.id],
    );
    return NextResponse.json({ success: true, connection: publicEntry(result.rows[0]) }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    const code = error instanceof Error ? error.message : "SERVICE_CONNECTION_FAILED";
    return NextResponse.json({
      error: code,
      message: code === "CREDENTIAL_REJECTED"
        ? "The service rejected this credential. Check the key and its permissions."
        : code === "NEON_PROJECT_NOT_VISIBLE"
          ? "The Neon key authenticated, but it cannot see the configured BALMZ AI project. Check the key scope and organization access."
          : code === "PAYSTACK_DEMO_KEY_REQUIRED" || code === "PAYSTACK_LIVE_KEY_REQUIRED"
            ? "The Paystack key prefix does not match the selected Demo/Live environment."
            : code === "PRIVATE_ENDPOINT_NOT_ALLOWED" || code === "INVALID_HTTPS_ENDPOINT"
              ? "Custom endpoints must use a public HTTPS address."
              : "The connection test failed. Check the provider credential and required access.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  let body: { id?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
    return NextResponse.json({ error: "INVALID_CONNECTION" }, { status: 400 });
  }
  try {
    const result = await getDbPool().query("DELETE FROM public.balmz_service_credentials WHERE id = $1 RETURNING id", [body.id]);
    if (!result.rowCount) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "DISCONNECT_FAILED" }, { status: 503 });
  }
}
