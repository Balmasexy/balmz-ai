import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getRenderApiToken } from "@/lib/render-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenderService = {
  id: string;
  name: string;
  type: string;
  branch?: string;
  repo?: string;
  serviceDetails?: { url?: string };
};
type RenderDeploy = {
  id: string;
  status: string;
  commit?: { id?: string; message?: string };
  createdAt?: string;
  updatedAt?: string;
};

async function authorized() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (!(await isAdminUser(session.user.id))) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { response: null };
}

function unavailable() {
  return NextResponse.json({
    configured: false,
    services: [],
    message: "Connect and test Render in Super Admin → Service connectors, or configure RENDER_API_KEY as a server-side secret in the BALMZ AI Render service environment. Never paste the key into the browser or chat.",
  }, { headers: { "Cache-Control": "no-store" } });
}

async function renderRequest(path: string, init?: RequestInit) {
  const key = await getRenderApiToken();
  const response = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) throw new Error("RENDER_AUTH_FAILED");
    if (status === 429) throw new Error("RENDER_RATE_LIMITED");
    throw new Error(`RENDER_HTTP_${status}`);
  }
  return response.json();
}

export async function GET() {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const raw = await renderRequest("/services?limit=50") as Array<{ service?: RenderService } | RenderService>;
    const services = raw.map((entry) => "service" in entry && entry.service ? entry.service : entry as RenderService)
      .filter((service) => service?.id && service?.name);
    const withDeploys = await Promise.all(services.map(async (service) => {
      try {
        const deployRaw = await renderRequest(`/services/${encodeURIComponent(service.id)}/deploys?limit=1`) as Array<{ deploy?: RenderDeploy } | RenderDeploy>;
        const first = deployRaw[0];
        const latest = first && "deploy" in first && first.deploy ? first.deploy : first as RenderDeploy | undefined;
        return { ...service, latestDeploy: latest ? {
          id: latest.id,
          status: latest.status,
          commitId: latest.commit?.id ?? null,
          commitMessage: latest.commit?.message ?? null,
          updatedAt: latest.updatedAt ?? latest.createdAt ?? null,
        } : null };
      } catch {
        return { ...service, latestDeploy: null };
      }
    }));
    return NextResponse.json({ configured: true, services: withDeploys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RENDER_UNAVAILABLE";
    if (code === "RENDER_NOT_CONFIGURED") return unavailable();
    const message = code === "RENDER_AUTH_FAILED" ? "Render rejected the configured API key. Replace it in Render environment settings."
      : code === "RENDER_RATE_LIMITED" ? "Render API rate limit reached. Wait briefly, then refresh."
      : "Could not retrieve Render services. Check the server configuration and try again.";
    return NextResponse.json({ configured: true, services: [], error: code, message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  let body: { serviceId?: unknown; clearCache?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.serviceId !== "string" || !/^srv-[a-zA-Z0-9]+$/.test(body.serviceId)) {
    return NextResponse.json({ error: "INVALID_SERVICE" }, { status: 400 });
  }

  try {
    const raw = await renderRequest("/services?limit=100") as Array<{ service?: RenderService } | RenderService>;
    const services = raw.map((entry) => "service" in entry && entry.service ? entry.service : entry as RenderService);
    const selected = services.find((service) => service.id === body.serviceId);
    if (!selected) return NextResponse.json({ error: "SERVICE_NOT_IN_CONNECTED_ACCOUNT" }, { status: 404 });

    const deploy = await renderRequest(`/services/${encodeURIComponent(selected.id)}/deploys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearCache: body.clearCache === true ? "clear" : "do_not_clear", deployMode: "build_and_deploy" }),
    }) as { id?: string; status?: string; createdAt?: string };
    return NextResponse.json({ success: true, service: { id: selected.id, name: selected.name }, deploy }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEPLOY_FAILED";
    if (code === "RENDER_NOT_CONFIGURED") return unavailable();
    const status = code === "RENDER_AUTH_FAILED" ? 502 : code === "RENDER_RATE_LIMITED" ? 429 : 502;
    return NextResponse.json({ error: code, message: code === "RENDER_AUTH_FAILED" ? "Render rejected the configured API key."
      : code === "RENDER_RATE_LIMITED" ? "Render API rate limit reached. Wait before trying again."
      : "Render could not start this deployment. Check service status and try again." }, { status });
  }
}
