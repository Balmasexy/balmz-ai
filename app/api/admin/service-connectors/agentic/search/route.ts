import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 160) {
    return NextResponse.json({ error: "INVALID_QUERY", message: "Search must contain 2–160 characters." }, { status: 400 });
  }

  try {
    const endpoint = new URL("https://agentic.ai/api/v1/search");
    endpoint.searchParams.set("q", query);
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json({
        error: response.status === 429 ? "AGENTIC_RATE_LIMITED" : "AGENTIC_SEARCH_FAILED",
        message: response.status === 429
          ? "The Agentic.ai public directory rate limit has been reached. Wait before searching again."
          : "The Agentic.ai directory could not return search results.",
      }, { status: response.status === 429 ? 429 : 502 });
    }
    const payload = await response.json() as { data?: unknown[]; results?: unknown[]; pagination?: { total?: number } };
    const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.results) ? payload.results : [];
    const results = raw.slice(0, 25).map((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        name: typeof item.name === "string" ? item.name : "Unnamed tool",
        slug: typeof item.slug === "string" ? item.slug : "",
        description: typeof item.shortDescription === "string" ? item.shortDescription : typeof item.description === "string" ? item.description : "",
        url: typeof item.url === "string" ? item.url : "",
        category: typeof item.category === "string" ? item.category : "",
        mcpSupport: typeof item.mcpSupport === "boolean" ? item.mcpSupport : null,
        openSource: typeof item.openSource === "boolean" ? item.openSource : null,
      };
    });
    return NextResponse.json({
      source: "Agentic.ai Directory",
      attribution: "Data from Agentic.ai Directory",
      total: payload.pagination?.total ?? results.length,
      results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "AGENTIC_UNAVAILABLE", message: "Could not reach the Agentic.ai directory. Try again later." }, { status: 502 });
  }
}
