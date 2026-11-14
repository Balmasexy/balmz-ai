import { domainToASCII } from "node:url";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getRenderApiToken } from "@/lib/render-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenderService = { id: string; name: string; type: string; serviceDetails?: { url?: string }; url?: string };
type CustomDomain = {
  id: string; name: string; domainType?: string; verificationStatus?: string;
  redirectForName?: string | null; createdAt?: string;
};

async function auth() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}

async function renderRequest(token: string, path: string, init?: RequestInit) {
  const response = await fetch("https://api.render.com/v1" + path, {
    ...init,
    headers: { Accept: "application/json", Authorization: "Bearer " + token, ...(init?.headers ?? {}) },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("RENDER_AUTH_FAILED");
    if (response.status === 429) throw new Error("RENDER_RATE_LIMITED");
    throw new Error("RENDER_HTTP_" + response.status);
  }
  return response.json() as Promise<unknown>;
}

function unwrapServices(value: unknown): RenderService[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => entry && typeof entry === "object" && "service" in entry && entry.service
    ? entry.service as RenderService : entry as RenderService).filter((item) => typeof item?.id === "string");
}
function unwrapDomains(value: unknown): CustomDomain[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => entry && typeof entry === "object" && "customDomain" in entry && entry.customDomain
    ? entry.customDomain as CustomDomain : entry as CustomDomain).filter((item) => typeof item?.name === "string");
}
function normalizeDomain(input: string): string {
  const wildcard = input.trim().startsWith("*.");
  const raw = wildcard ? input.trim().slice(2) : input.trim();
  if (raw.includes("://") || raw.includes("/") || raw.includes(":") || raw.includes("@") || raw.includes("*")) {
    throw new Error("INVALID_DOMAIN");
  }
  const ascii = domainToASCII(raw.toLowerCase().replace(/\.$/, ""));
  if (!ascii || ascii.length > 253 || !ascii.includes(".") || ascii === "localhost" ||
      ascii === "onrender.com" || ascii.endsWith(".onrender.com") ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(ascii)) {
    throw new Error("INVALID_DOMAIN");
  }
  return (wildcard ? "*." : "") + ascii;
}
function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "RENDER_DOMAIN_FAILED";
  const status = code === "RENDER_NOT_CONFIGURED" ? 503 : code === "INVALID_DOMAIN" ? 400 : code === "RENDER_RATE_LIMITED" ? 429 : 502;
  const message = code === "RENDER_NOT_CONFIGURED" ? "Connect Render in Super Admin → Service connectors."
    : code === "RENDER_AUTH_FAILED" ? "Render rejected the saved API key. Reconnect the Render service connector."
    : code === "RENDER_RATE_LIMITED" ? "Render is temporarily rate-limiting domain requests."
    : code === "INVALID_DOMAIN" ? "Enter a valid domain such as app.example.com, without https:// or a path."
    : "Render could not complete this domain request.";
  return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const denied = await auth();
  if (denied) return denied;
  const serviceId = new URL(request.url).searchParams.get("serviceId") ?? "";
  if (!/^srv-[a-zA-Z0-9]+$/.test(serviceId)) return NextResponse.json({ error: "INVALID_SERVICE" }, { status: 400 });
  try {
    const token = await getRenderApiToken();
    const services = unwrapServices(await renderRequest(token, "/services?limit=100"));
    const service = services.find((item) => item.id === serviceId);
    if (!service) return NextResponse.json({ error: "SERVICE_NOT_IN_CONNECTED_ACCOUNT" }, { status: 404 });
    if (!["web_service", "static_site"].includes(service.type)) {
      return NextResponse.json({ error: "DOMAINS_NOT_SUPPORTED", message: "Render custom domains are available for web services and static sites." }, { status: 400 });
    }
    const domains = unwrapDomains(await renderRequest(token, "/services/" + encodeURIComponent(serviceId) + "/custom-domains?limit=100"));
    return NextResponse.json({
      service: { id: service.id, name: service.name, type: service.type },
      deploymentUrl: service.serviceDetails?.url ?? service.url ?? null,
      domains,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const denied = await auth();
  if (denied) return denied;
  let body: { serviceId?: unknown; domain?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof body.serviceId !== "string" || !/^srv-[a-zA-Z0-9]+$/.test(body.serviceId) ||
      typeof body.domain !== "string" || body.domain.length > 300) {
    return NextResponse.json({ error: "INVALID_REQUEST", message: "Select a service and enter a domain name." }, { status: 400 });
  }
  try {
    const domain = normalizeDomain(body.domain);
    const token = await getRenderApiToken();
    const services = unwrapServices(await renderRequest(token, "/services?limit=100"));
    const service = services.find((item) => item.id === body.serviceId);
    if (!service) return NextResponse.json({ error: "SERVICE_NOT_IN_CONNECTED_ACCOUNT" }, { status: 404 });
    if (!["web_service", "static_site"].includes(service.type)) {
      return NextResponse.json({ error: "DOMAINS_NOT_SUPPORTED", message: "Only web services and static sites support custom domains." }, { status: 400 });
    }
    const existing = unwrapDomains(await renderRequest(token, "/services/" + encodeURIComponent(service.id) + "/custom-domains?limit=100"));
    if (existing.some((item) => item.name.toLowerCase() === domain.toLowerCase())) {
      return NextResponse.json({ success: true, duplicate: true, domain: existing.find((item) => item.name.toLowerCase() === domain.toLowerCase()) }, { headers: { "Cache-Control": "no-store" } });
    }
    const created = await renderRequest(token, "/services/" + encodeURIComponent(service.id) + "/custom-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    });
    const createdItems = unwrapDomains(created);
    return NextResponse.json({ success: true, domain: createdItems[0] ?? created }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
