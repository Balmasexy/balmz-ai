import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { discoverCustomerMcpTools } from "@/lib/integrations/customer-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  if (!id || id.length > 100) return NextResponse.json({ error: "INVALID_CONNECTION_ID" }, { status: 400 });
  try {
    const tools = await discoverCustomerMcpTools(session.user.id, id);
    return NextResponse.json({ tools }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const code = error instanceof Error ? error.message : "MCP_TOOL_DISCOVERY_FAILED";
    const status = code === "MCP_CONNECTION_NOT_FOUND" ? 404 : 502;
    return NextResponse.json({ error: status === 404 ? code : "MCP_TOOL_DISCOVERY_FAILED", message: "MCP tools could not be refreshed from this connection." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
