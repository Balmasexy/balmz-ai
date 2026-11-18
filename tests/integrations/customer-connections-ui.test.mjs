import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("../../app/dashboard/connections/connections-workspace.tsx", import.meta.url), "utf8").catch(() => "");
const page = await readFile(new URL("../../app/dashboard/connections/page.tsx", import.meta.url), "utf8").catch(() => "");
const api = await readFile(new URL("../../app/api/integrations/route.ts", import.meta.url), "utf8");

test("My Connections UI exposes provider configuration, connect and disconnect actions", () => {
  assert.ok(workspace.includes("Connect account"), "connect account action missing");
  assert.ok(workspace.includes("Disconnect"), "disconnect action missing");
  assert.ok(workspace.includes("/api/integrations"), "customer connections API not used");
  assert.ok(workspace.includes("CUSTOMER_CONNECTION_SCHEMA_REQUIRED"), "migration-required state missing");
});

test("My Connections page requires a signed-in user", () => {
  assert.ok(page.includes("getSession"), "session check missing");
  assert.ok(page.includes("redirect("), "unauthenticated redirect missing");
});

test("customer connection list and delete are owner scoped", () => {
  assert.match(api, /WHERE user_id = \$1/);
  assert.match(api, /WHERE id = \$1 AND user_id = \$2/);
});
