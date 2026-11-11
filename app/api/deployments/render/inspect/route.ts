import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenderService = {
  id: string;
  ownerId?: string;
  name: string;
  type: string;
  serviceDetails?: Record<string, unknown>;
  [key: string]: unknown;
};

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}

async function renderRequest(path: string) {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error("RENDER_NOT_CONFIGURED");
  const response = await fetch(`https://api.render.com/v1${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "RENDER_AUTH_FAILED" : `RENDER_HTTP_${response.status}`);
  return response.json() as Promise<unknown>;
}

function unwrapList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (entry && typeof entry === "object" && "service" in entry && entry.service) return entry.service as T;
    if (entry && typeof entry === "object" && "deploy" in entry && entry.deploy) return entry.deploy as T;
    if (entry && typeof entry === "object" && "event" in entry && entry.event) return entry.event as T;
    return entry as T;
  });
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "RENDER_UNAVAILABLE";
  const status = code === "RENDER_NOT_CONFIGURED" ? 503 : code === "RENDER_AUTH_FAILED" ? 502 : code === "RENDER_RATE_LIMITED" ? 429 : 502;
  const message = code === "RENDER_NOT_CONFIGURED"
    ? "Add RENDER_API_KEY to the BALMZ AI Render service environment to connect this workplace."
    : code === "RENDER_AUTH_FAILED"
      ? "Render rejected the configured API key. Replace it in Render environment settings."
      : code === "RENDER_HTTP_404"
        ? "Render did not find this resource."
        : code === "RENDER_HTTP_429"
          ? "Render API rate limit reached. Refresh shortly."
          : "Render could not return this service data. Check the provider and retry.";
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const denied = await authorize();
  if (denied) return denied;

  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const view = url.searchParams.get("view") ?? "deploys";
  if (!/^srv-[a-zA-Z0-9]+$/.test(serviceId)) {
    return NextResponse.json({ error: "INVALID_SERVICE" }, { status: 400 });
  }
  if (!["deploys", "logs", "metrics", "events"].includes(view)) {
    return NextResponse.json({ error: "INVALID_VIEW" }, { status: 400 });
  }

  try {
    const services = unwrapList<RenderService>(await renderRequest("/services?limit=100"));
    const service = services.find((item) => item.id === serviceId);
    if (!service) return NextResponse.json({ error: "SERVICE_NOT_IN_CONNECTED_ACCOUNT" }, { status: 404 });

    if (view === "events") {
      const params = new URLSearchParams({ limit: "30" });
      const events = unwrapList<Record<string, unknown>>(await renderRequest(
        "/services/" + encodeURIComponent(serviceId) + "/events?" + params.toString(),
      ));
      return NextResponse.json({ view, serviceId, events }, { headers: { "Cache-Control": "no-store" } });
    }

    if (view === "deploys") {
      const params = new URLSearchParams({ limit: "25" });
      const deploys = unwrapList<Record<string, unknown>>(await renderRequest(
        `/services/${encodeURIComponent(serviceId)}/deploys?${params.toString()}`,
      ));
      return NextResponse.json({ view, serviceId, deploys }, { headers: { "Cache-Control": "no-store" } });
    }

    if (view === "logs") {
      const ownerId = typeof service.ownerId === "string" ? service.ownerId : "";
      if (!ownerId) return NextResponse.json({ error: "RENDER_OWNER_UNKNOWN", message: "Render did not report a workspace owner for this service." }, { status: 502 });
      const params = new URLSearchParams({
        ownerId,
        direction: "backward",
        limit: "100",
      });
      params.append("resource", serviceId);
      params.append("type", "app");
      params.append("type", "build");
      const payload = await renderRequest(`/logs?${params.toString()}`) as { logs?: unknown[]; hasMore?: boolean; nextStartTime?: string; nextEndTime?: string };
      const logs = Array.isArray(payload.logs) ? payload.logs : [];
      return NextResponse.json({
        view,
        serviceId,
        logs: logs.slice(0, 100),
        hasMore: Boolean(payload.hasMore),
        nextStartTime: payload.nextStartTime ?? null,
        nextEndTime: payload.nextEndTime ?? null,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const now = Date.now();
    const startTime = new Date(now - 60 * 60 * 1000).toISOString();
    const endTime = new Date(now).toISOString();
    const base = new URLSearchParams({
      resource: serviceId,
      startTime,
      endTime,
      resolutionSeconds: "60",
    });
    const metric = async (path: string) => {
      try {
        return await renderRequest(`/metrics/${path}?${base.toString()}`);
      } catch {
        return [];
      }
    };
    const [cpu, memory, instanceCount] = await Promise.all([
      metric("cpu"),
      metric("memory"),
      metric("instance-count"),
    ]);
    return NextResponse.json({ view, serviceId, range: { startTime, endTime }, cpu, memory, instanceCount }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
