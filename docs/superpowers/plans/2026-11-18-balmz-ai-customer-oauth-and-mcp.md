# BALMZ AI Customer OAuth and Remote MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let customers securely connect their own productivity and developer accounts and remote MCP servers, isolated by BALMZ user identity.

**Architecture:** Add a provider registry and OAuth state/token persistence using additive Neon migrations. Use authenticated Next.js routes for authorization start, callback, listing, refresh, disconnect and MCP tool discovery/calls. Store encrypted credentials server-side and apply owner-ID filters to every query.

**Tech Stack:** Next.js 15.5, Better Auth, Neon PostgreSQL, Node crypto, existing `@modelcontextprotocol/sdk` 1.20.x dependency.

**Spec:** `docs/superpowers/specs/2026-11-18-balmz-ai-workspace-expansion-design.md`

## Global Constraints

- Customer records are always scoped by the authenticated `user.id`.
- Use one-time, short-lived OAuth state and PKCE where supported.
- OAuth tokens are encrypted and never returned to client code.
- Require provider credentials as server-only environment variables; never invent or commit credentials.
- Validate remote MCP endpoints against SSRF and redirect attacks.
- Read-only tool calls may run without write approval; write or destructive calls require a confirmation flow.
- Do not automatically apply production database migrations.

## Review Focus

- Cross-user ID guessing cannot read, update, refresh, revoke or call another customer's connection.
- OAuth callback rejects missing, expired, reused and mismatched state.
- Provider token refresh preserves rotated refresh tokens.
- Private IP, IPv6 local, DNS rebinding and redirects cannot reach internal services.
- MCP tools with side effects cannot execute without user confirmation.

---

### Task 1: Add customer integration schema

**Files:**
- Create: `db/migrations/0011_customer_oauth_connections.sql`
- Create: `db/migrations/0012_customer_mcp_connections.sql`

- [ ] Add SQL contract checks for owner foreign keys, uniqueness, expiry, encryption fields and audit timestamps.
- [ ] Verify migration contract checks fail until both migration files exist.
- [ ] Add additive tables and indexes; grant only the required permissions to `balmz_ai_app`.
- [ ] Do not modify existing rows or automatically run the migration.
- [ ] Review SQL against existing migration patterns.

### Task 2: Implement OAuth provider registry and state lifecycle

**Files:**
- Create: `lib/integrations/customer-oauth.ts`
- Create: `app/api/integrations/[provider]/start/route.ts`
- Create: `app/api/integrations/[provider]/callback/route.ts`
- Create: `app/api/integrations/route.ts`

- [ ] Add tests for unsupported providers, expired/consumed state, redirect URI construction and owner binding.
- [ ] Verify tests fail against missing OAuth registry/state handlers.
- [ ] Implement supported providers: Google, Microsoft, Slack, Dropbox, Box, GitHub, GitLab and Notion, each with explicit minimal scopes and documented environment variable names.
- [ ] Encrypt access/refresh tokens using an authenticated encryption format with dedicated AAD.
- [ ] Store provider identity, granted scopes, expiry and status; never return token ciphertext.
- [ ] Implement owner-scoped list and disconnect routes; implement refresh/revoke where provider endpoints support them.
- [ ] Run typecheck, build and OAuth route tests.

### Task 3: Implement remote MCP connection lifecycle

**Files:**
- Create: `lib/integrations/customer-mcp.ts`
- Create: `app/api/integrations/mcp/route.ts`
- Create: `app/api/integrations/mcp/[id]/tools/route.ts`
- Create: `app/api/integrations/mcp/[id]/call/route.ts`

- [ ] Add tests for endpoint validation, user ownership, schema validation, tool timeout and approval requirements.
- [ ] Verify focused tests fail before implementation.
- [ ] Use Streamable HTTP MCP client transport to connect and list tools.
- [ ] Validate public HTTPS destinations and reject private/reserved IPs; revalidate DNS and redirects at connection time.
- [ ] Store endpoints and encrypted connection credentials under the customer owner ID.
- [ ] Classify tool descriptions and require explicit confirmation for writes/side effects.
- [ ] Add audit records and request/response size limits; fail closed on protocol or authorization errors.
- [ ] Run typecheck, build and integration tests using an in-process local test server.

### Task 4: Build My Connections UI and connect plugin directory

**Files:**
- Create: `app/dashboard/connections/page.tsx`
- Create: `app/dashboard/connections/connections-workspace.tsx`
- Modify: `app/dashboard/plugins/plugin-workspace.tsx`
- Modify: dashboard navigation components as required.

- [ ] Add UI tests for connection state and empty/error states.
- [ ] Implement provider connect, permission review, status, refresh, test, disconnect and MCP tool discovery.
- [ ] Keep customer-owned OAuth integrations visually distinct from shared admin-managed integrations.
- [ ] Connect only when backend status says connected; show missing environment credentials as not configured.
- [ ] Run typecheck and production build.

### Task 5: Configure and verify real provider authorization

- [ ] Add only variable names and callback URL templates to `.env.example` and provider setup documentation.
- [ ] Verify callback URLs and scopes against provider consoles.
- [ ] Do not create fake test credentials.
- [ ] Require owner to configure Google/Microsoft/Slack/Dropbox/Box/GitHub/GitLab/Notion OAuth client details in Render.
- [ ] Apply migrations only after a separate explicit production database change approval.
- [ ] Test at least one real customer OAuth account and one real MCP server before marking the connectors operational.
