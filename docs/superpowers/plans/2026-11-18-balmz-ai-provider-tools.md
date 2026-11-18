# BALMZ AI OpenAI and Gemini Tool Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give BALMZ AI users model-aware access to supported OpenAI Responses and Gemini tools without misrepresenting provider or model capabilities.

**Architecture:** Add an explicit tool capability registry and a Responses API adapter for OpenAI models. Add a separate Gemini adapter using native generateContent tool definitions. Reuse customer-owned MCP connections from the customer integration layer and keep each user's files/tools isolated.

**Tech Stack:** Next.js 15.5, TypeScript, existing provider credential encryption, OpenAI Responses API, Gemini generateContent API, existing MCP SDK.

**Spec:** `docs/superpowers/specs/2026-11-18-balmz-ai-workspace-expansion-design.md`

## Global Constraints

- Never silently route a provider through an incompatible API surface.
- Use real model IDs and provider capability checks.
- Tool calls are server-side and logged without secrets or private file content.
- File stores and MCP connections are user-scoped.
- Do not execute untrusted code or shell commands on the BALMZ app server.
- Keep current monthly message metering and unlimited Super Admin behavior.

## Review Focus

- A model without a requested capability cannot receive that tool.
- Missing credentials/vector store/MCP authorization produces a safe actionable error.
- Tool results cannot leak across user IDs.
- Provider 4xx/5xx/rate limits are surfaced without secret values.
- A tool-call loop has bounded steps, elapsed time, output bytes and cost accounting.

---

### Task 1: Add provider capability registry

**Files:**
- Create: `lib/ai/tool-capabilities.ts`
- Modify: `app/admin/ai-connections-section.tsx`
- Modify: `app/dashboard/plugins/plugin-workspace.tsx`

- [ ] Add tests for provider/model capability filtering and unsupported tool requests.
- [ ] Verify tests fail against the current provider list.
- [ ] Define separate OpenAI Responses and Gemini tool registries.
- [ ] Ensure UI derives available options from model/provider capability metadata.
- [ ] Run typecheck and build.

### Task 2: Add OpenAI Responses adapter

**Files:**
- Create: `lib/ai/openai-responses.ts`
- Create: `app/api/ai/responses/route.ts`
- Modify: dashboard chat/tool settings UI.

- [ ] Add tests for allowed tool configuration, response parsing, request bounds and model capability rejection.
- [ ] Verify red tests before implementation.
- [ ] Implement web search, code interpreter, image generation, user-owned file search/vector-store selection, custom function calling and authorized remote MCP.
- [ ] Add user confirmation for remote MCP write-capable tools.
- [ ] Bound input/output size, time, tool count and request concurrency.
- [ ] Keep Computer Use/Shell disabled until isolated sandbox infrastructure is independently implemented and verified.
- [ ] Meter request and tool usage without changing the Free 50-message or Super Admin unlimited policy.
- [ ] Run route tests, typecheck and production build.

### Task 3: Add Gemini native tools adapter

**Files:**
- Create: `lib/ai/gemini-tools.ts`
- Create: `app/api/ai/gemini-tools/route.ts`
- Modify: model/tool settings UI.

- [ ] Add tests for compatible-model tool filtering, request serialization and provider errors.
- [ ] Verify tests fail before implementation.
- [ ] Implement Google Search, Maps, URL context, File Search, Code Execution and custom function calling using the correct Gemini request shapes.
- [ ] Gate tools by provider key and model support; require separate confirmation for computer-use or side-effecting calls.
- [ ] Add cost/usage visibility and safe provider error handling.
- [ ] Run route tests, typecheck and production build.

### Task 4: End-to-end verification and docs

**Files:**
- Modify: `docs/AI-CONNECTIONS.md`
- Modify: `docs/CLIENT-WORKPLACE.md`
- Modify: `README.md`

- [ ] Verify one real OpenAI tool call and one real Gemini tool call with configured credentials.
- [ ] Verify an unsupported model rejects the capability and does not fake a successful response.
- [ ] Verify customer files/MCP resources remain user-scoped.
- [ ] Verify usage accounting and audit events.
- [ ] Confirm final Render deploy is live and inspect the authenticated customer flow.
