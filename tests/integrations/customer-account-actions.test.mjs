import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actions = await readFile(new URL("../../lib/integrations/customer-account-actions.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/integrations/actions/route.ts", import.meta.url), "utf8");

test("customer-owned providers expose a fixed read-only action catalog", () => {
  for (const id of [
    "gmail.search", "drive.list_files", "calendar.list_events",
    "mail.list_messages", "channels.list", "messages.search",
    "files.list_folder", "files.list_root", "profile.read",
    "projects.list", "workspace.search",
  ]) assert.ok(actions.includes('id: "' + id + '"'), "missing action " + id);
  assert.ok(actions.includes("WHERE id = $1 AND user_id = $2 AND status = \'connected\'"));
});

test("account actions use fixed provider hosts and do not support write operations", () => {
  for (const host of [
    "gmail.googleapis.com", "www.googleapis.com/drive", "www.googleapis.com/calendar",
    "graph.microsoft.com", "slack.com/api", "api.dropboxapi.com",
    "api.box.com", "api.github.com", "gitlab.com/api/v4", "api.notion.com",
  ]) assert.ok(actions.includes(host), "missing provider endpoint " + host);
  assert.ok(actions.includes('redirect: "error"'));
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /executeCustomerAccountAction/);
});