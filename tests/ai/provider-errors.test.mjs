import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../../lib/ai/provider-errors.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/ai/chat/route.ts", import.meta.url), "utf8");

test("provider error diagnostics classify quota separately from temporary rate limits", () => {
  assert.match(helper, /quotaSignal/);
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

const workplace = await readFile(new URL("../../app/dashboard/client-workplace.tsx", import.meta.url), "utf8");

test("chat defaults to a connected Gemini model before a paid OpenAI model", () => {
  assert.match(workplace, /find\(\(option\) => \/google\|gemini\/i\.test\(option\.provider \+ " " \+ option\.label\)\)/);
});

test("quota failures keep messages queued and require an explicit retry using the selected provider", () => {
  assert.match(workplace, /queueBlockedReasonRef\.current === "quota"/);
  assert.match(workplace, /payload\.error === "AI_PROVIDER_QUOTA_EXCEEDED"/);
  assert.match(workplace, /pendingMessagesRef\.current = pendingMessagesRef\.current\.map\(\(pending\) => \(\{ \.\.\.pending, model \}\)\)/);
});
