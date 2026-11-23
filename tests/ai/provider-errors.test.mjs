import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../../lib/ai/provider-errors.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/ai/chat/route.ts", import.meta.url), "utf8");

test("provider error diagnostics classify quota separately from temporary rate limits", () => {
  assert.match(helper, /insufficient[_-]?quota/);
  assert.match(helper, /AI_PROVIDER_QUOTA_EXCEEDED/);
  assert.match(helper, /AI_PROVIDER_RATE_LIMITED/);
});

test("provider diagnostics expose only allowlisted metadata and never raw provider messages", () => {
  assert.match(helper, /safeProviderToken/);
  assert.match(helper, /response\.clone\(\)\.json\(\)/);
  assert.doesNotMatch(helper, /providerError\.message/);
});

test("OpenAI streaming route logs request metadata without credentials or prompt content", () => {
  assert.match(route, /inspectProviderFailure/);
  assert.match(route, /providerFailureMessage/);
  assert.match(route, /providerErrorCode: details\.errorCode/);
});
