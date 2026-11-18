import test from "node:test";
import assert from "node:assert/strict";

const security = await import("../../lib/integrations/customer-mcp-security.js").catch(() => null);

test("MCP endpoint validator rejects non-HTTPS, credentials, loopback and private targets", () => {
  assert.ok(security, "MCP security helpers are not implemented");
  assert.throws(() => security.normalizeMcpEndpoint("http://example.com/mcp"));
  assert.throws(() => security.normalizeMcpEndpoint("https://user:pass@example.com/mcp"));
  assert.throws(() => security.assertPublicMcpAddress("127.0.0.1"));
  assert.throws(() => security.assertPublicMcpAddress("10.0.0.2"));
  assert.throws(() => security.assertPublicMcpAddress("169.254.169.254"));
  assert.throws(() => security.assertPublicMcpAddress("::1"));
  assert.doesNotThrow(() => security.assertPublicMcpAddress("8.8.8.8"));
});

test("MCP tool calls require confirmation unless explicitly marked read-only", () => {
  assert.ok(security, "MCP security helpers are not implemented");
  assert.equal(security.isMcpToolReadOnly({ annotations: { readOnlyHint: true }, name: "search_docs" }), true);
  assert.equal(security.isMcpToolReadOnly({ annotations: { readOnlyHint: false }, name: "delete_file" }), false);
  assert.equal(security.isMcpToolReadOnly({ name: "delete_customer" }), false);
  assert.equal(security.isMcpToolReadOnly({ name: "read_file" }), false);
});

test("MCP tool arguments are validated against saved JSON schema", () => {
  assert.ok(security, "MCP security helpers are not implemented");
  const schema = {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 100 },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
    required: ["query"],
    additionalProperties: false,
  };
  assert.doesNotThrow(() => security.validateMcpArguments(schema, { query: "hello", limit: 5 }));
  assert.throws(() => security.validateMcpArguments(schema, { limit: 5 }));
  assert.throws(() => security.validateMcpArguments(schema, { query: "hello", extra: true }));
  assert.throws(() => security.validateMcpArguments(schema, { query: "x".repeat(101) }));
});
