import { Client } from "pg";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getNeonApiToken, neonApiRequest } from "@/lib/neon-api";
import { getRenderApiToken } from "@/lib/render-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NeonProject = { id: string; name: string; region_id?: string; pg_version?: number };
type NeonBranch = { id: string; name: string; default?: boolean; primary?: boolean };
type NeonDatabase = { name: string; owner_name?: string };
type NeonRole = { name: string; protected?: boolean };
type RenderService = { id: string; name: string; type: string };

async function auth() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}
function unwrap<T>(payload: unknown, key: string): T[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>)[key];
  return Array.isArray(data) ? data as T[] : [];
}
function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "NEON_INTEGRATION_FAILED";
  const status = code === "NEON_NOT_CONFIGURED" || code === "RENDER_NOT_CONFIGURED" ? 503
    : code === "NEON_RATE_LIMITED" ? 429
    : code === "INVALID_SELECTION" ? 400 : 502;
  const message = code === "NEON_NOT_CONFIGURED"
    ? "Connect Neon in Super Admin → Service connectors first."
    : code === "RENDER_NOT_CONFIGURED"
      ? "Connect Render in Super Admin → Service connectors first."
      : code === "NEON_AUTH_FAILED"
        ? "Neon rejected the saved API key. Reconnect the Neon service connector."
        : code === "RENDER_AUTH_FAILED"
          ? "Render rejected the saved API key. Reconnect the Render service connector."
          : code === "NEON_RATE_LIMITED"
            ? "Neon is temporarily rate-limiting requests."
            : code === "DATABASE_CONNECTION_TEST_FAILED"
              ? "Neon returned a connection string but the database connection test failed. Check the selected branch, role, and endpoint."
              : "The Neon integration could not be completed. Check the selected project and service.";
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,60}$/i.test(value);
}

export async function GET(request: Request) {
  const denied = await auth();
  if (denied) return denied;
  try {
    const token = await getNeonApiToken();
    const url = new URL(request.url);
    const serviceId = url.searchParams.get("serviceId");
    const projectId = url.searchParams.get("projectId");
    const branchId = url.searchParams.get("branchId");
    if (serviceId && !/^srv-[a-zA-Z0-9]+$/.test(serviceId)) return NextResponse.json({ error: "INVALID_SELECTION" }, { status: 400 });
    if (projectId && !validId(projectId)) return NextResponse.json({ error: "INVALID_SELECTION" }, { status: 400 });
    if (branchId && !validId(branchId)) return NextResponse.json({ error: "INVALID_SELECTION" }, { status: 400 });
    let databaseUrlConfigured: boolean | undefined;
    if (serviceId) {
      const renderToken = await getRenderApiToken();
      const servicesResponse = await fetch("https://api.render.com/v1/services?limit=100", { headers: { Authorization: "Bearer " + renderToken, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!servicesResponse.ok) throw new Error(servicesResponse.status === 401 || servicesResponse.status === 403 ? "RENDER_AUTH_FAILED" : "RENDER_SERVICE_LOOKUP_FAILED");
      const rows = await servicesResponse.json() as Array<{ service?: { id: string } } | { id: string }>;
      if (!rows.some((entry) => ("service" in entry && entry.service ? entry.service.id : entry.id) === serviceId)) return NextResponse.json({ error: "SERVICE_NOT_AVAILABLE" }, { status: 404 });
      const current = await fetch("https://api.render.com/v1/services/" + encodeURIComponent(serviceId) + "/env-vars/DATABASE_URL", { headers: { Authorization: "Bearer " + renderToken, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (current.status === 404) databaseUrlConfigured = false;
      else if (current.ok) databaseUrlConfigured = true;
      else if (current.status === 401 || current.status === 403) throw new Error("RENDER_AUTH_FAILED");
      else throw new Error("RENDER_ENV_LOOKUP_FAILED");
    }
    if (!projectId) {
      const data = await neonApiRequest<{ projects?: NeonProject[] }>(token, "/projects?limit=100");
      return NextResponse.json({ configured: true, databaseUrlConfigured, projects: unwrap<NeonProject>(data, "projects").map((item) => ({ id: item.id, name: item.name, region: item.region_id ?? null, postgresVersion: item.pg_version ?? null })) }, { headers: { "Cache-Control": "no-store" } });
    }
    const projectData = await neonApiRequest<{ project?: NeonProject }>(token, "/projects/" + encodeURIComponent(projectId));
    const project = projectData.project;
    if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    const branchesData = await neonApiRequest<{ branches?: NeonBranch[] }>(token, "/projects/" + encodeURIComponent(projectId) + "/branches?limit=100");
    const branches = unwrap<NeonBranch>(branchesData, "branches");
    if (!branchId) return NextResponse.json({ project: { id: project.id, name: project.name }, databaseUrlConfigured, branches: branches.map((item) => ({ id: item.id, name: item.name, isDefault: Boolean(item.default || item.primary) })) }, { headers: { "Cache-Control": "no-store" } });
    if (!branches.some((item) => item.id === branchId)) return NextResponse.json({ error: "BRANCH_NOT_IN_PROJECT" }, { status: 404 });
    const [dbData, roleData] = await Promise.all([
      neonApiRequest<{ databases?: NeonDatabase[] }>(token, "/projects/" + encodeURIComponent(projectId) + "/branches/" + encodeURIComponent(branchId) + "/databases?limit=100"),
      neonApiRequest<{ roles?: NeonRole[] }>(token, "/projects/" + encodeURIComponent(projectId) + "/branches/" + encodeURIComponent(branchId) + "/roles?limit=100"),
    ]);
    return NextResponse.json({ databases: unwrap<NeonDatabase>(dbData, "databases").map((item) => ({ name: item.name, owner: item.owner_name ?? null })), roles: unwrap<NeonRole>(roleData, "roles").map((item) => ({ name: item.name, protected: Boolean(item.protected) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeError(error); }
}
export async function POST(request: Request) {
  const denied = await auth();
  if (denied) return denied;
  let body: { serviceId?: unknown; projectId?: unknown; branchId?: unknown; databaseName?: unknown; roleName?: unknown; pooled?: unknown; replaceExisting?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!validId(body.serviceId) || !validId(body.projectId) || !validId(body.branchId) ||
      typeof body.databaseName !== "string" || body.databaseName.length < 1 || body.databaseName.length > 63 ||
      typeof body.roleName !== "string" || body.roleName.length < 1 || body.roleName.length > 63) {
    return NextResponse.json({ error: "INVALID_SELECTION", message: "Choose a Render service, Neon project, branch, database and role." }, { status: 400 });
  }

  try {
    const neonToken = await getNeonApiToken();
    const renderToken = await getRenderApiToken();
    const servicesRaw = await fetch("https://api.render.com/v1/services?limit=100", {
      headers: { Authorization: "Bearer " + renderToken, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    });
    if (!servicesRaw.ok) throw new Error(servicesRaw.status === 401 || servicesRaw.status === 403 ? "RENDER_AUTH_FAILED" : "RENDER_SERVICE_LOOKUP_FAILED");
    const serviceRows = await servicesRaw.json() as Array<{ service?: RenderService } | RenderService>;
    const services = serviceRows.map((item) => item && "service" in item && item.service ? item.service : item as RenderService);
    const service = services.find((item) => item.id === body.serviceId);
    if (!service || !["web_service", "private_service", "background_worker", "cron_job"].includes(service.type)) {
      return NextResponse.json({ error: "SERVICE_NOT_AVAILABLE" }, { status: 404 });
    }

    const projectData = await neonApiRequest<{ project?: NeonProject }>(neonToken, "/projects/" + encodeURIComponent(body.projectId));
    const branchData = await neonApiRequest<{ branches?: NeonBranch[] }>(neonToken, "/projects/" + encodeURIComponent(body.projectId) + "/branches?limit=100");
    const branches = unwrap<NeonBranch>(branchData, "branches");
    if (!projectData.project || !branches.some((item) => item.id === body.branchId)) throw new Error("INVALID_SELECTION");

    const [databases, roles] = await Promise.all([
      neonApiRequest<{ databases?: NeonDatabase[] }>(neonToken, "/projects/" + encodeURIComponent(body.projectId) + "/branches/" + encodeURIComponent(body.branchId) + "/databases?limit=100"),
      neonApiRequest<{ roles?: NeonRole[] }>(neonToken, "/projects/" + encodeURIComponent(body.projectId) + "/branches/" + encodeURIComponent(body.branchId) + "/roles?limit=100"),
    ]);
    if (!unwrap<NeonDatabase>(databases, "databases").some((item) => item.name === body.databaseName) ||
        !unwrap<NeonRole>(roles, "roles").some((item) => item.name === body.roleName)) throw new Error("INVALID_SELECTION");

    const query = new URLSearchParams({
      branch_id: body.branchId,
      database_name: body.databaseName,
      role_name: body.roleName,
      pooled: body.pooled === false ? "false" : "true",
    });
    const connection = await neonApiRequest<{ uri?: string }>(neonToken, "/projects/" + encodeURIComponent(body.projectId) + "/connection_uri?" + query.toString());
    if (typeof connection.uri !== "string") throw new Error("NEON_URI_MISSING");
    const connectionUrl = new URL(connection.uri);
    if (!["postgres:", "postgresql:"].includes(connectionUrl.protocol) ||
        !connectionUrl.hostname.endsWith(".neon.tech") ||
        !connectionUrl.username || !connectionUrl.password ||
        !connectionUrl.searchParams.has("sslmode")) throw new Error("NEON_URI_INVALID");

    const client = new Client({ connectionString: connection.uri, connectionTimeoutMillis: 12_000, query_timeout: 8_000 });
    try {
      await client.connect();
      const test = await client.query("SELECT 1 AS connected");
      if (test.rows?.[0]?.connected !== 1) throw new Error("DATABASE_CONNECTION_TEST_FAILED");
    } catch {
      throw new Error("DATABASE_CONNECTION_TEST_FAILED");
    } finally {
      await client.end().catch(() => undefined);
    }

    const currentVariable = await fetch("https://api.render.com/v1/services/" + encodeURIComponent(body.serviceId) + "/env-vars/DATABASE_URL", {
      headers: { Authorization: "Bearer " + renderToken, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (currentVariable.ok && body.replaceExisting !== true) return NextResponse.json({ error: "DATABASE_URL_EXISTS", message: "This Render service already has DATABASE_URL. Confirm that you want to replace it with the selected Neon connection." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (!currentVariable.ok && currentVariable.status !== 404) throw new Error(currentVariable.status === 401 || currentVariable.status === 403 ? "RENDER_AUTH_FAILED" : "RENDER_ENV_LOOKUP_FAILED");

    const update = await fetch("https://api.render.com/v1/services/" + encodeURIComponent(body.serviceId) + "/env-vars/DATABASE_URL", {
      method: "PUT",
      headers: { Authorization: "Bearer " + renderToken, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ value: connection.uri }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    });
    if (!update.ok) throw new Error(update.status === 401 || update.status === 403 ? "RENDER_AUTH_FAILED" : "RENDER_ENV_UPDATE_FAILED");

    return NextResponse.json({
      success: true,
      variable: "DATABASE_URL",
      service: { id: service.id, name: service.name },
      database: { project: projectData.project.name, branch: branches.find((item) => item.id === body.branchId)?.name, database: body.databaseName, role: body.roleName, pooled: body.pooled !== false },
      deployRequired: true,
      message: "Neon connection verified and DATABASE_URL saved on the Render service. Render will not deploy this environment change automatically; deploy the service when ready.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeError(error); }
}
