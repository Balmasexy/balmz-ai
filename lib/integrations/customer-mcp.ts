import { request as httpsRequest } from "node:https";
import { Transform, Readable } from "node:stream";
import { randomUUID, createHash } from "node:crypto";
import { isIP } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getDbPool } from "@/lib/db";
import { encryptCustomerOAuthValue, decryptCustomerOAuthValue } from "@/lib/integrations/customer-oauth";
import {
  MAX_MCP_REQUEST_BYTES,
  MAX_MCP_RESPONSE_BYTES,
  MAX_MCP_TOOLS,
  MCP_REQUEST_TIMEOUT_MS,
  normalizeMcpEndpoint,
  resolvePublicMcpEndpoint,
  validateMcpArguments,
  isMcpToolReadOnly,
} from "@/lib/integrations/customer-mcp-security.js";

type McpToolRecord = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
};

type CustomerMcpConnectionRow = {
  id: string;
  user_id: string;
  display_name: string;
  endpoint_url: string;
  auth_type: "none" | "bearer";
  encrypted_credentials: string | null;
  status: string;
  server_name: string | null;
  server_version: string | null;
  discovered_tools: McpToolRecord[];
  last_tested_at: string | null;
  last_error_code: string | null;
};

function authorizationHeaders(authType: "none" | "bearer", encryptedCredentials: string | null): Record<string, string> {
  if (authType === "none") return {};
  if (!encryptedCredentials) throw new Error("MCP_CREDENTIAL_MISSING");
  const credential = decryptCustomerOAuthValue(encryptedCredentials);
  if (!credential || credential.length > 4096) throw new Error("MCP_CREDENTIAL_INVALID");
  return { Authorization: "Bearer " + credential };
}

function pinnedMcpFetch(input: RequestInfo | URL, init: RequestInit | undefined, pin: {
  url: URL;
  address: string;
  family: number;
}): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    let requestUrl: URL;
    try {
      requestUrl = input instanceof Request ? new URL(input.url) : new URL(String(input));
      if (requestUrl.origin !== pin.url.origin || requestUrl.protocol !== "https:") {
        throw new Error("MCP_REQUEST_ORIGIN_CHANGED");
      }
    } catch (error) {
      reject(error);
      return;
    }

    const inheritedHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inheritedHeaders);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

    let body: string | Uint8Array | undefined;
    const rawBody = init?.body ?? (input instanceof Request ? input.body : null);
    if (typeof rawBody === "string") body = rawBody;
    else if (rawBody instanceof Uint8Array) body = rawBody;
    else if (rawBody instanceof ArrayBuffer) body = new Uint8Array(rawBody);
    else if (rawBody != null) {
      reject(new Error("MCP_REQUEST_BODY_UNSUPPORTED"));
      return;
    }
    if (body && Buffer.byteLength(body) > MAX_MCP_REQUEST_BYTES) {
      reject(new Error("MCP_REQUEST_TOO_LARGE"));
      return;
    }

    const targetHost = requestUrl.host;
    const hostname = requestUrl.hostname.replace(/^\[|\]$/g, "");
    const options = {
      protocol: "https:",
      hostname: pin.address,
      port: Number(requestUrl.port || 443),
      path: requestUrl.pathname + requestUrl.search,
      method: init?.method || (input instanceof Request ? input.method : "GET"),
      headers: { ...Object.fromEntries(headers.entries()), host: targetHost },
      ...(pin.family === 6 ? { family: 6 } : { family: 4 }),
      ...(isIPLiteral(hostname) ? {} : { servername: hostname }),
      signal: init?.signal || (input instanceof Request ? input.signal : undefined),
    };

    const request = httpsRequest(options, (incoming) => {
      const contentLength = Number(incoming.headers["content-length"] || 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_MCP_RESPONSE_BYTES) {
        incoming.destroy(new Error("MCP_RESPONSE_TOO_LARGE"));
        reject(new Error("MCP_RESPONSE_TOO_LARGE"));
        return;
      }

      let bytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > MAX_MCP_RESPONSE_BYTES) {
            callback(new Error("MCP_RESPONSE_TOO_LARGE"));
            return;
          }
          callback(null, chunk);
        },
      });
      incoming.on("error", (error) => limiter.destroy(error));
      incoming.pipe(limiter);

      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") responseHeaders.set(key, value);
        else if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
      }

      const status = incoming.statusCode || 502;
      resolve(new Response(status === 204 || status === 304 ? null : Readable.toWeb(limiter) as ReadableStream, {
        status,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });

    const timeout = setTimeout(() => {
      request.destroy(new Error("MCP_REQUEST_TIMEOUT"));
    }, MCP_REQUEST_TIMEOUT_MS);
    request.once("response", (incoming) => {
      incoming.once("end", () => clearTimeout(timeout));
      incoming.once("close", () => clearTimeout(timeout));
    });
    request.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    if (body) request.write(body);
    request.end();
  });
}

function isIPLiteral(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizeTools(rawTools: unknown): McpToolRecord[] {
  if (!Array.isArray(rawTools)) throw new Error("MCP_TOOL_LIST_INVALID");
  return rawTools.slice(0, MAX_MCP_TOOLS).flatMap((raw): McpToolRecord[] => {
    if (!raw || typeof raw !== "object") return [];
    const tool = raw as Record<string, unknown>;
    if (typeof tool.name !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(tool.name)) return [];
    const schema = tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)
      ? tool.inputSchema as Record<string, unknown>
      : { type: "object", properties: {} };
    const safeDescription = typeof tool.description === "string" ? tool.description.slice(0, 2000) : "";
    return [{
      name: tool.name,
      description: safeDescription,
      inputSchema: schema,
      readOnly: isMcpToolReadOnly(tool),
    }];
  });
}

async function openMcpClient(row: Pick<CustomerMcpConnectionRow, "endpoint_url" | "auth_type" | "encrypted_credentials">) {
  const pin = await resolvePublicMcpEndpoint(row.endpoint_url);
  const headers: Record<string, string> = authorizationHeaders(row.auth_type, row.encrypted_credentials);
  const client = new Client({ name: "balmz-ai-customer-mcp", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(pin.url, {
    requestInit: {
      headers,
      redirect: "error",
      cache: "no-store",
    },
    fetch: (input, init) => pinnedMcpFetch(input as RequestInfo | URL, init, pin),
  });
  await client.connect(transport);
  return client;
}

export async function addCustomerMcpConnection(input: {
  userId: string;
  displayName: string;
  endpointUrl: string;
  bearerToken?: string;
}) {
  const url = normalizeMcpEndpoint(input.endpointUrl);
  const encryptedCredentials = input.bearerToken
    ? encryptCustomerOAuthValue(input.bearerToken.trim())
    : null;
  const authType = encryptedCredentials ? "bearer" : "none";
  const candidate = {
    endpoint_url: url.toString(),
    auth_type: authType as "none" | "bearer",
    encrypted_credentials: encryptedCredentials,
  };
  const client = await openMcpClient(candidate);
  let tools: McpToolRecord[];
  let serverInfo: { name?: string; version?: string } = {};
  try {
    const result = await client.listTools();
    tools = normalizeTools(result.tools);
    serverInfo = (client as unknown as { getServerVersion?: () => { name?: string; version?: string } }).getServerVersion?.() ?? {};
  } finally {
    await client.close().catch(() => undefined);
  }

  const result = await getDbPool().query<CustomerMcpConnectionRow>(
    `INSERT INTO public.balmz_customer_mcp_connections
       (id, user_id, display_name, endpoint_url, auth_type, encrypted_credentials,
        status, server_name, server_version, discovered_tools, last_tested_at, last_error_code)
     VALUES ($1, $2, $3, $4, $5, $6, 'connected', $7, $8, $9::jsonb, now(), NULL)
     RETURNING id, user_id, display_name, endpoint_url, auth_type, encrypted_credentials,
               status, server_name, server_version, discovered_tools, last_tested_at, last_error_code`,
    [randomUUID(), input.userId, input.displayName, url.toString(), authType, encryptedCredentials,
      serverInfo.name ?? null, serverInfo.version ?? null, JSON.stringify(tools)],
  );
  return publicMcpConnection(result.rows[0]);
}

function publicMcpConnection(row: CustomerMcpConnectionRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    endpointUrl: row.endpoint_url,
    authType: row.auth_type,
    status: row.status,
    serverName: row.server_name,
    serverVersion: row.server_version,
    tools: row.discovered_tools ?? [],
    lastTestedAt: row.last_tested_at,
    lastErrorCode: row.last_error_code,
  };
}

export async function listCustomerMcpConnections(userId: string) {
  const result = await getDbPool().query<CustomerMcpConnectionRow>(
    `SELECT id, user_id, display_name, endpoint_url, auth_type, encrypted_credentials,
            status, server_name, server_version, discovered_tools, last_tested_at, last_error_code
       FROM public.balmz_customer_mcp_connections
      WHERE user_id = $1 AND status <> 'disconnected'
      ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(publicMcpConnection);
}

export async function getCustomerMcpConnection(userId: string, connectionId: string) {
  const result = await getDbPool().query<CustomerMcpConnectionRow>(
    `SELECT id, user_id, display_name, endpoint_url, auth_type, encrypted_credentials,
            status, server_name, server_version, discovered_tools, last_tested_at, last_error_code
       FROM public.balmz_customer_mcp_connections
      WHERE id = $1 AND user_id = $2 AND status = 'connected'
      LIMIT 1`,
    [connectionId, userId],
  );
  return result.rows[0] ?? null;
}

export async function discoverCustomerMcpTools(userId: string, connectionId: string) {
  const row = await getCustomerMcpConnection(userId, connectionId);
  if (!row) throw new Error("MCP_CONNECTION_NOT_FOUND");
  const client = await openMcpClient(row);
  let tools: McpToolRecord[];
  try {
    const result = await client.listTools();
    tools = normalizeTools(result.tools);
  } finally {
    await client.close().catch(() => undefined);
  }
  await getDbPool().query(
    `UPDATE public.balmz_customer_mcp_connections
        SET discovered_tools = $3::jsonb, status = 'connected',
            last_tested_at = now(), last_error_code = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [connectionId, userId, JSON.stringify(tools)],
  );
  return tools;
}

export async function callCustomerMcpTool(input: {
  userId: string;
  connectionId: string;
  toolName: string;
  args: unknown;
  confirmed: boolean;
  approvalRequestId?: string;
}) {
  const row = await getCustomerMcpConnection(input.userId, input.connectionId);
  if (!row) throw new Error("MCP_CONNECTION_NOT_FOUND");
  const tools = normalizeTools(row.discovered_tools);
  const tool = tools.find((candidate) => candidate.name === input.toolName);
  if (!tool) throw new Error("MCP_TOOL_NOT_FOUND");
  validateMcpArguments(tool.inputSchema, input.args);

  const argsHash = createHash("sha256").update(JSON.stringify(input.args)).digest("hex");
  const approvalRequired = true; // Remote MCP tools are untrusted; require explicit confirmation for every invocation.
  let requestId: string = randomUUID();

  if (approvalRequired && !input.confirmed) {
    await getDbPool().query(
      `INSERT INTO public.balmz_customer_mcp_tool_events
         (id, connection_id, user_id, request_id, tool_name, arguments_sha256,
          status, approval_required)
       VALUES ($1, $2, $3, $4, $5, $6, 'approval_required', true)`,
      [randomUUID(), input.connectionId, input.userId, requestId, tool.name, argsHash],
    );
    return { approvalRequired: true, requestId };
  }

  if (approvalRequired && input.confirmed) {
    if (!input.approvalRequestId || !/^[0-9a-f-]{36}$/i.test(input.approvalRequestId)) {
      throw new Error("MCP_APPROVAL_NOT_FOUND");
    }
    const approved = await getDbPool().query<{ request_id: string }>(
      `UPDATE public.balmz_customer_mcp_tool_events
          SET status = 'approved', approved_at = now()
        WHERE request_id = $1 AND connection_id = $2 AND user_id = $3
          AND tool_name = $4 AND arguments_sha256 = $5
          AND status = 'approval_required' AND approval_required = true
        RETURNING request_id`,
      [input.approvalRequestId, input.connectionId, input.userId, tool.name, argsHash],
    );
    if (!approved.rows[0]) throw new Error("MCP_APPROVAL_NOT_FOUND");
    requestId = approved.rows[0].request_id;
  } else {
    await getDbPool().query(
      `INSERT INTO public.balmz_customer_mcp_tool_events
         (id, connection_id, user_id, request_id, tool_name, arguments_sha256,
          status, approval_required)
       VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', false)`,
      [randomUUID(), input.connectionId, input.userId, requestId, tool.name, argsHash],
    );
  }

  const client = await openMcpClient(row);
  try {
    const result = await client.callTool({ name: input.toolName, arguments: input.args as Record<string, unknown> });
    const content = JSON.stringify(result.content ?? []);
    if (Buffer.byteLength(content, "utf8") > MAX_MCP_RESPONSE_BYTES) throw new Error("MCP_TOOL_RESULT_TOO_LARGE");
    if (result.isError) {
      await getDbPool().query(
        "UPDATE public.balmz_customer_mcp_tool_events SET status = 'failed', error_code = 'MCP_TOOL_FAILED' WHERE request_id = $1 AND user_id = $2",
        [requestId, input.userId],
      );
      throw new Error("MCP_TOOL_FAILED");
    }
    await getDbPool().query(
      "UPDATE public.balmz_customer_mcp_tool_events SET status = 'succeeded' WHERE request_id = $1 AND user_id = $2",
      [requestId, input.userId],
    );
    return { approvalRequired: false, requestId, result: result.content ?? [] };
  } catch (error) {
    await getDbPool().query(
      "UPDATE public.balmz_customer_mcp_tool_events SET status = 'failed', error_code = 'MCP_TOOL_FAILED' WHERE request_id = $1 AND user_id = $2",
      [requestId, input.userId],
    ).catch(() => undefined);
    throw error;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function disconnectCustomerMcpConnection(userId: string, connectionId: string) {
  const result = await getDbPool().query(
    "DELETE FROM public.balmz_customer_mcp_connections WHERE id = $1 AND user_id = $2",
    [connectionId, userId],
  );
  return Boolean(result.rowCount);
}
