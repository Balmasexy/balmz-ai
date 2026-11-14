import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getRenderApiToken } from "@/lib/render-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenderService = { id: string; name: string; type: string; suspended?: string };
type Action = "restart" | "suspend" | "resume";

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED", message: "Sign in to manage Render services." }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN", message: "Super Admin access is required." }, { status: 403 });
  return null;
}

async function renderRequest(path: string, init?: RequestInit) {
  const key = await getRenderApiToken();
  const response = await fetch("https://api.render.com/v1" + path, {
    ...init,
    headers: { Accept: "application/json", Authorization: "Bearer " + key, ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("RENDER_AUTH_FAILED");
    if (response.status === 402) throw new Error("RENDER_PAYMENT_REQUIRED");
    if (response.status === 404) throw new Error("RENDER_RESOURCE_NOT_FOUND");
    if (response.status === 409) throw new Error("RENDER_STATE_CONFLICT");
    if (response.status === 429) throw new Error("RENDER_RATE_LIMITED");
    throw new Error("RENDER_HTTP_" + response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : { accepted: true, status: response.status };
}

function unwrapServices(value: unknown): RenderService[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" && "service" in item && item.service
    ? item.service as RenderService
    : item as RenderService).filter((item) => Boolean(item?.id));
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "RENDER_ACTION_FAILED";
  const status = code === "RENDER_NOT_CONFIGURED" ? 503 : code === "RENDER_RATE_LIMITED" ? 429 : code === "RENDER_PAYMENT_REQUIRED" ? 402 : 502;
  const message = code === "RENDER_NOT_CONFIGURED" ? "RENDER_API_KEY is not present in the BALMZ AI server environment."
    : code === "RENDER_AUTH_FAILED" ? "Render rejected the server-side API key. Check the key in Render environment settings."
    : code === "RENDER_PAYMENT_REQUIRED" ? "Render requires billing information or an eligible plan for this action. No plan was changed."
    : code === "RENDER_RESOURCE_NOT_FOUND" ? "Render no longer recognizes this service. Refresh the service list."
    : code === "RENDER_STATE_CONFLICT" ? "The service is not in a state that allows this action."
    : code === "RENDER_RATE_LIMITED" ? "Render rate-limited this action. Wait before retrying."
    : "Render could not complete this server action. No service configuration was changed.";
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  let body: { serviceId?: unknown; action?: unknown };
  try { body = await request.json() as { serviceId?: unknown; action?: unknown }; }
  catch { return NextResponse.json({ error: "INVALID_JSON", message: "Request must be valid JSON." }, { status: 400 }); }

  if (typeof body.serviceId !== "string" || !/^srv-[a-zA-Z0-9]+$/.test(body.serviceId)) {
    return NextResponse.json({ error: "INVALID_SERVICE", message: "Select a valid Render service." }, { status: 400 });
  }
  const action = body.action as Action;
  if (!["restart", "suspend", "resume"].includes(action)) {
    return NextResponse.json({ error: "INVALID_ACTION", message: "Choose restart, suspend or resume." }, { status: 400 });
  }

  try {
    const services = unwrapServices(await renderRequest("/services?limit=100&includePreviews=false"));
    const service = services.find((item) => item.id === body.serviceId);
    if (!service) return NextResponse.json({ error: "SERVICE_NOT_IN_CONNECTED_ACCOUNT", message: "This service is not part of the connected Render account." }, { status: 404 });
    if (action === "restart" && service.type === "cron_job") {
      return NextResponse.json({ error: "RESTART_NOT_SUPPORTED", message: "Render does not support restarting cron jobs from this endpoint." }, { status: 400 });
    }
    if (action === "suspend" && service.suspended === "suspended") {
      return NextResponse.json({ error: "ALREADY_SUSPENDED", message: "This service is already suspended." }, { status: 409 });
    }
    if (action === "resume" && service.suspended !== "suspended") {
      return NextResponse.json({ error: "NOT_SUSPENDED", message: "This service is not suspended." }, { status: 409 });
    }
    await renderRequest("/services/" + encodeURIComponent(service.id) + "/" + action, { method: "POST" });
    return NextResponse.json({ success: true, action, service: { id: service.id, name: service.name }, message: action === "restart" ? "Render accepted the restart request." : action === "suspend" ? "Render accepted the suspend request." : "Render accepted the resume request." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}