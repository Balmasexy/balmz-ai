import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import {
  addCustomerMcpConnection,
  disconnectCustomerMcpConnection,
  listCustomerMcpConnections,
} from "@/lib/integrations/customer-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function currentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

function schemaRequired() {
  return NextResponse.json({
    error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED",
    message: "Customer remote MCP connections require the reviewed additive migrations 0011 and 0012.",
  }, { status: 503, headers: noStore });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ connections: await listCustomerMcpConnections(user.id) }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    return NextResponse.json({ error: "MCP_CONNECTIONS_UNAVAILABLE", message: "Your MCP connections could not be loaded." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { displayName?: unknown; endpointUrl?: unknown; bearerToken?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const endpointUrl = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : "";
  const bearerToken = typeof body.bearerToken === "string" ? body.bearerToken.trim() : "";
  if (displayName.length < 2 || displayName.length > 80) return NextResponse.json({ error: "INVALID_DISPLAY_NAME", message: "Give this MCP server a name between 2 and 80 characters." }, { status: 400, headers: noStore });
  if (!endpointUrl || endpointUrl.length > 1000) return NextResponse.json({ error: "INVALID_ENDPOINT", message: "Enter the HTTPS MCP server endpoint." }, { status: 400, headers: noStore });
  if (bearerToken.length > 4096) return NextResponse.json({ error: "INVALID_CREDENTIAL", message: "The MCP bearer token is too long." }, { status: 400, headers: noStore });

  try {
    const connection = await addCustomerMcpConnection({
      userId: user.id,
      displayName,
      endpointUrl,
      bearerToken: bearerToken || undefined,
    });
    return NextResponse.json({ connection }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    const code = error instanceof Error ? error.message : "MCP_CONNECTION_FAILED";
    const safe = [
      "MCP_ENDPOINT_INVALID",
      "MCP_ENDPOINT_PRIVATE_OR_RESERVED",
      "MCP_ENDPOINT_DNS_FAILED",
      "MCP_CREDENTIAL_MISSING",
      "MCP_CREDENTIAL_INVALID",
      "MCP_TOOL_LIST_INVALID",
      "MCP_REQUEST_TIMEOUT",
      "MCP_REQUEST_ORIGIN_CHANGED",
    ].includes(code) ? code : "MCP_CONNECTION_FAILED";
    return NextResponse.json({
      error: safe,
      message: safe === "MCP_ENDPOINT_PRIVATE_OR_RESERVED"
        ? "That server resolves to a private or reserved network address. Use a public HTTPS MCP endpoint."
        : safe === "MCP_ENDPOINT_INVALID"
          ? "Use an HTTPS endpoint without embedded credentials, query parameters or fragments."
          : "BALMZ AI could not establish a valid MCP handshake and discover its tools.",
    }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { id?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.id !== "string" || body.id.length > 100) return NextResponse.json({ error: "INVALID_CONNECTION_ID" }, { status: 400, headers: noStore });
  try {
    const removed = await disconnectCustomerMcpConnection(user.id, body.id);
    return removed
      ? NextResponse.json({ success: true }, { headers: noStore })
      : NextResponse.json({ error: "MCP_CONNECTION_NOT_FOUND" }, { status: 404, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    return NextResponse.json({ error: "MCP_DISCONNECT_FAILED" }, { status: 503, headers: noStore });
  }
}
