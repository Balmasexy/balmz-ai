import test from "node:test";
import assert from "node:assert/strict";

const capability = await import("../../lib/ai/tool-capabilities.js").catch(() => null);

test("OpenAI tool definitions allow Responses built-ins but not unsafe host tools", () => {
  assert.ok(capability, "tool capability registry is not implemented");
  const tools = capability.buildOpenAIResponseTools(["web_search", "code_interpreter", "image_generation", "computer_use", "shell"]);
  assert.deepEqual(tools.map((item) => item.type), ["web_search", "code_interpreter", "image_generation"]);
});

test("OpenAI file search requires at least one user-owned vector store", () => {
  assert.ok(capability, "tool capability registry is not implemented");
  assert.equal(capability.buildOpenAIResponseTools(["file_search"]).length, 0);
  assert.equal(capability.buildOpenAIResponseTools(["file_search"], ["vs_user_owned"]).length, 1);
});

test("Gemini tool definitions use native tool configuration and model-gate Maps", () => {
  assert.ok(capability, "tool capability registry is not implemented");
  const flash = capability.buildGeminiTools("gemini-3.1-flash-lite", ["google_search", "url_context", "code_execution", "google_maps", "file_search"]);
  assert.deepEqual(flash.map((item) => Object.keys(item)[0]), ["google_search", "url_context", "code_execution"]);
  const maps = capability.buildGeminiTools("gemini-3.5-flash", ["google_maps"]);
  assert.deepEqual(maps, [{ google_maps: {} }]);
});

test("provider capability registry rejects unknown providers and unsupported model features", () => {
  assert.ok(capability, "tool capability registry is not implemented");
  assert.deepEqual(capability.getProviderToolCapabilities("unknown", "model"), []);
  const google = capability.getProviderToolCapabilities("google", "gemini-2.0-flash");
  assert.equal(google.find((item) => item.id === "google_maps")?.available, false);
  assert.equal(google.find((item) => item.id === "file_search")?.available, false);
});
