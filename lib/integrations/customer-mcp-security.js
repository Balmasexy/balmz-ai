import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_MCP_REQUEST_BYTES = 32 * 1024;
export const MAX_MCP_RESPONSE_BYTES = 1024 * 1024;
export const MAX_MCP_TOOLS = 100;
export const MCP_REQUEST_TIMEOUT_MS = 20_000;

const IPV4_BLOCKED = [
  (a) => a === 0,
  (a) => a === 10,
  (a) => a === 127,
  (a) => a >= 224,
  (a, b) => a === 100 && b >= 64 && b <= 127,
  (a, b) => a === 169 && b === 254,
  (a, b) => a === 172 && b >= 16 && b <= 31,
  (a, b) => a === 192 && [0, 168].includes(b),
  (a, b, c) => a === 198 && [18, 19, 51].includes(b),
  (a, b, c, d) => a === 203 && b === 0 && c === 113,
  (a, b, c, d) => a === 192 && b === 0 && c === 0,
];

function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const parts = address.split(".").map(Number);
  return !IPV4_BLOCKED.some((rule) => rule(...parts));
}

function isPublicIPv6(address) {
  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPublicIPv4(mapped);
    return false;
  }
  if (!/^[23][0-9a-f]{3}:/i.test(normalized)) return false;
  if (
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:10:") ||
    normalized.startsWith("2001:20:") ||
    normalized.startsWith("2002:") ||
    normalized.startsWith("3fff:")
  ) return false;
  return true;
}

export function assertPublicMcpAddress(address) {
  const family = isIP(address);
  if (family === 4 && isPublicIPv4(address)) return true;
  if (family === 6 && isPublicIPv6(address)) return true;
  throw new Error("MCP_ENDPOINT_PRIVATE_OR_RESERVED");
}

export function normalizeMcpEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("MCP_ENDPOINT_INVALID"); }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port && (Number(url.port) < 1 || Number(url.port) > 65535)
  ) throw new Error("MCP_ENDPOINT_INVALID");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid")
  ) throw new Error("MCP_ENDPOINT_PRIVATE_OR_RESERVED");

  if (isIP(host)) assertPublicMcpAddress(host);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

export async function resolvePublicMcpEndpoint(value) {
  const url = normalizeMcpEndpoint(value);
  let addresses;
  try {
    addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
  } catch {
    throw new Error("MCP_ENDPOINT_DNS_FAILED");
  }
  if (!addresses.length) throw new Error("MCP_ENDPOINT_DNS_FAILED");
  for (const item of addresses) assertPublicMcpAddress(item.address);
  return {
    url,
    address: addresses[0].address,
    family: addresses[0].family,
  };
}

function schemaTypeMatches(type, value) {
  switch (type) {
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return true;
  }
}

function validateSchemaNode(schema, value, path, depth) {
  if (depth > 12 || !schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("MCP_TOOL_SCHEMA_INVALID");
  }
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((type) => schemaTypeMatches(type, value))) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
  } else if (typeof schema.type === "string" && !schemaTypeMatches(schema.type, value)) {
    throw new Error("MCP_TOOL_ARGUMENT_INVALID");
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    throw new Error("MCP_TOOL_ARGUMENT_INVALID");
  }
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
    if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern).test(value))) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
    if (typeof schema.maximum === "number" && value > schema.maximum) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) => validateSchemaNode(schema.items, item, path + "[" + index + "]", depth + 1));
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error("MCP_TOOL_ARGUMENT_INVALID");
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) throw new Error("MCP_TOOL_ARGUMENT_INVALID");
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        validateSchemaNode(properties[key], child, path + "." + key, depth + 1);
      }
    }
  }
}

export function validateMcpArguments(schema, args) {
  const encoded = JSON.stringify(args);
  if (!encoded || Buffer.byteLength(encoded, "utf8") > MAX_MCP_REQUEST_BYTES) {
    throw new Error("MCP_TOOL_ARGUMENTS_TOO_LARGE");
  }
  validateSchemaNode(schema, args, "$", 0);
  return true;
}

const MUTATING_NAME = /(create|write|update|edit|delete|remove|send|post|put|patch|submit|purchase|pay|transfer|move|invite|grant|revoke|publish|deploy|execute|run|close|cancel|archive|upload|share|set|change)/i;

export function isMcpToolReadOnly(tool) {
  const annotations = tool && typeof tool === "object" && tool.annotations && typeof tool.annotations === "object"
    ? tool.annotations
    : {};
  const name = typeof tool?.name === "string" ? tool.name : "";
  const description = typeof tool?.description === "string" ? tool.description : "";
  if (annotations.destructiveHint === true || annotations.readOnlyHint !== true) return false;
  if (MUTATING_NAME.test(name)) return false;
  if (/(write|create|update|delete|send|transfer|purchase|modify|change|submit|publish|deploy)/i.test(description)) return false;
  return true;
}
