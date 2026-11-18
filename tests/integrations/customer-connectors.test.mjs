import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plugins = await readFile(new URL("../../app/dashboard/plugins/plugin-workspace.tsx", import.meta.url), "utf8");

test("customer-owned account providers are discoverable from the Plugins directory", () => {
  for (const provider of [
    "Google Workspace", "Microsoft 365", "Slack", "Dropbox", "Box",
    "GitHub public repositories", "GitLab", "My Notion workspace", "Remote MCP servers",
  ]) {
    assert.ok(plugins.includes('name: "' + provider + '"'), "missing customer connector: " + provider);
  }
});

test("customer-owned connectors use the customer connection workspace, not admin secrets", () => {
  assert.match(plugins, /access: "customer"/);
  assert.match(plugins, /\\/dashboard\\/connections/);
  assert.match(plugins, /My connections/);
});
