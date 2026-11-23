import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, client, workspace, helper, packageJson] = await Promise.all([
  readFile(new URL("../../app/api/media/runway/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/dashboard/images/runway-media-studio.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/dashboard/images/images-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../lib/ai/runway.ts", import.meta.url), "utf8"),
  readFile(new URL("../../package.json", import.meta.url), "utf8"),
]);

test("Runway SDK is installed and its credential is server-only", () => {
  const parsed = JSON.parse(packageJson);
  assert.ok(parsed.dependencies?.["@runwayml/sdk"], "official Runway SDK dependency must be present");
  assert.match(helper, /process\.env\.RUNWAYML_API_SECRET/);
  assert.doesNotMatch(client, /process\.env\.RUNWAYML_API_SECRET|apiKey\s*:/, "browser component must not access the Runway secret");
  assert.match(route, /getRunwayClient/);
});

test("media API supports authenticated text-to-image and both video workflows", () => {
  assert.match(route, /getAuth\(\)\.api\.getSession/);
  assert.match(route, /runway\.textToImage\.create/);
  assert.match(route, /runway\.textToVideo\.create/);
  assert.match(route, /runway\.imageToVideo\.create/);
  assert.match(route, /runway\.tasks\.retrieve/);
  assert.match(route, /consumeUsage\(\{/);
  assert.match(route, /getCurrentSubscription/);
});

test("media jobs are owner-scoped and saved without a schema migration", () => {
  assert.match(route, /INSERT INTO public\.balmz_notes/);
  assert.match(route, /WHERE id = \$1 AND user_id = \$2/);
  assert.match(route, /BALMZ Runway Media/);
  assert.match(route, /ON CONFLICT \(id\) DO NOTHING/);
});

test("media workspace exposes generation modes, task polling and download links", () => {
  assert.match(workspace, /RunwayMediaStudio/);
  assert.match(client, /Image from prompt/);
  assert.match(client, /Video from prompt/);
  assert.match(client, /Animate an image/);
  assert.match(client, /setInterval/);
  assert.match(client, /Open \/ save media/);
  assert.match(client, /Animate this image/);
});

test("Runway failures are mapped to safe provider messages", () => {
  assert.match(helper, /RUNWAY_AUTH_FAILED/);
  assert.match(helper, /RUNWAY_ACCESS_DENIED/);
  assert.match(helper, /RUNWAY_RATE_LIMITED/);
  assert.doesNotMatch(helper, /console\.log|console\.error/);
});
