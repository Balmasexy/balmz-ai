import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { callCustomerMcpTool } from "@/lib/integrations/customer-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  let body: { toolName?: unknown; arguments?: unknown; confirmed?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  if (!id || id.length > 100 || typeof body.toolName !== "string" || body.toolName.length > 100) {
    return NextResponse.json({ error: "INVALID_TOOL_REQUEST" }, { status: 400 });
  }
  const args = body.arguments === undefined ? {} : body.arguments;
  const encoded = JSON.stringify(args);
  if (!encoded || Buffer.byteLength(encoded, "utf8") > 32 * 1024) {
    return NextResponse.json({ error: "MCP_TOOL_ARGUMENTS_TOO_LARGE" }, { status: 413 });
  }
  try {
    const result = await callCustomerMcpTool({
      userId: session.user.id,
      connectionId: id,
      toolName: body.toolName,
      args,
      confirmed: body.confirmed === true,
    });
    if (result.approvalRequired) {
      return NextResponse.json({
        error: "MCP_APPROVAL_REQUIRED",
        message: "This tool may change data or cause an external action. Confirm the exact action before running it.",
        requestId: result.requestId,
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED" }, { status: 503 });
    }
    const code = error instanceof Error ? error.message : "MCP_TOOL_FAILED";
    const status = code === "MCP_CONNECTION_NOT_FOUND" || code === "MCP_TOOL_NOT_FOUND" ? 404
      : code === "MCP_TOOL_ARGUMENT_INVALID" || code === "MCP_TOOL_ARGUMENTS_TOO_LARGE" ? 400
        : 502;
    const safeCode = [
      "MCP_CONNECTION_NOT_FOUND", "MCP_TOOL_NOT_FOUND",
      "MCP_TOOL_ARGUMENT_INVALID", "MCP_TOOL_ARGUMENTS_TOO_LARGE",
      "MCP_TOOL_RESULT_TOO_LARGE", "MCP_TOOL_FAILED",
    ].includes(code) ? code : "MCP_TOOL_FAILED";
    return NextResponse.json({ error: safeCode, message: "The MCP tool did not complete successfully." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
