# BALMZ AI Workspace and Integrations Expansion

**Approved:** 18 November 2026

## Intent

Expand BALMZ AI into a practical creative and connected AI workspace. Customers must be able to connect their own accounts without sharing those credentials with other customers. Shared platform infrastructure, payment credentials, and shared AI-provider credentials remain under Super Admin control.

## Goals

1. Make Images a useful, reliable discovery and creation workspace with broader categories, truthful source/license attribution, and visual creative-template previews.
2. Add customer-owned connections for Google, Microsoft, Slack, Dropbox, Box, GitHub, GitLab, and Notion using provider OAuth, explicit consent, minimal scopes, and per-user data isolation.
3. Add remote MCP server connections that are scoped to the customer who authorized them, with tool discovery, safe invocation, revocation, and confirmation for write-capable actions.
4. Expose real OpenAI Responses and Google Gemini tools through provider-specific adapters, respecting each provider's actual model and feature support.
5. Connect the Plugins directory to real connection state and actual actions rather than displaying catalog-only integrations as connected.

## Accepted architecture

Use a combined ownership model:
- **Customer-owned:** Google/Microsoft productivity accounts, Slack, Dropbox, Box, GitHub/GitLab, Notion, and customer MCP servers. Each credential and token belongs to exactly one authenticated BALMZ user.
- **Super Admin-owned:** shared AI provider keys, Render, Neon, payment services, shared analytics and application-wide service connectors.
- **Provider adapters:** OpenAI Responses tools and Gemini native tools are distinct adapters. The capability matrix is derived from provider, model, and configured credentials.
- **Remote MCP:** use the project's existing `@modelcontextprotocol/sdk` dependency and Streamable HTTP transport. Do not expose remote credentials to the browser.
- **Incremental schema:** use additive, versioned Neon migrations. Never reset or recreate production data.

## Images and templates

Expand the existing categories to include food, technology, architecture, business, fashion, sports, education, lifestyle, space, backgrounds and wallpapers, while preserving nature, animals, travel, art, design and portraits. Preserve source attribution and per-image license links. Expand the curated fallback with category coverage and sufficient results for an initial gallery page. Do not label curated images as live popularity rankings.

Expand template types to include business cards, flyers, menus, website headers, app concepts, book covers, podcast covers, product mockups, infographics, invitations, advertising creatives and presentation layouts. Each template must have a real visual preview, a clear category, an editable prompt and an action to use it in chat. Do not use copied brand marks or copyrighted characters.

## Customer OAuth requirements

- Authorization begins from an authenticated user session.
- OAuth state is unguessable, one-time, short-lived and bound to the initiating user and provider. Use PKCE where supported.
- Callback validates state before exchanging authorization codes.
- Access and refresh tokens are encrypted at rest; plaintext tokens are never returned to a browser or logged.
- Persist provider account identity, granted scopes, token expiry, and connection status.
- Every list, refresh, revoke and action query is filtered by the authenticated owner ID.
- Disconnect removes the BALMZ credential and attempts provider revocation where supported; it does not delete customer files or revoke unrelated platform keys.
- Missing OAuth client credentials produce a truthful not-configured state, not a fake connected state.

## Remote MCP requirements

- Only HTTPS public endpoints are accepted. Validate host/IP resolution and block loopback, private, link-local, multicast, and metadata destinations. Disable redirects or revalidate every redirect.
- The server connects only from backend code with the customer's encrypted token.
- Discover tools and schemas through the MCP protocol; validate tool arguments against discovered schemas before calls.
- Read-only tools may be enabled under the user's permissions. Write/side-effect tools require explicit confirmation in the user flow.
- Enforce per-connection timeouts, response-size bounds, tool allowlists and audit events.
- Connection failures, authentication failures, stale schemas and unsupported transport versions must fail closed.

## OpenAI and Gemini tools

- OpenAI Responses: expose available web search, file search, Code Interpreter, image generation, custom function calling and remote MCP features only when the selected model/account supports them and the required server resources exist. Computer use and shell execution require a separate sandboxed execution design and must not run arbitrary commands on the BALMZ web service.
- Gemini: expose Google Search, Maps, URL context, File Search, Code Execution and function calling only on compatible Gemini models and only with the correct provider configuration. Computer use must be separately gated.
- Tool execution is server-side; per-user file stores and customer MCP tools must not cross account boundaries.
- Tool calls and provider usage are metered and audited. Never fabricate results or imply that a provider capability is enabled merely because a checkbox exists.

## Security and data invariants

- Preserve all existing users, messages, subscriptions, payments, usage counters, AI-provider credentials, service connector credentials, and deployment configuration.
- Keep the existing Free-plan 50-message monthly allowance and unlimited Super Admin allowance.
- Keep payment Demo/Live separation and the explicit Live activation safeguards.
- No secrets in source control, client bundles, logs, URLs, or chat.
- Production migrations are additive and must be applied using the Neon migration/owner role after migration review; app runtime must not auto-run DDL.

## Non-goals and anti-goals

- Do not connect arbitrary accounts without user consent.
- Do not silently grant broad OAuth scopes.
- Do not claim all OpenAI/Gemini tools work with all models.
- Do not execute untrusted code or browser actions inside the BALMZ app server.
- Do not represent a listed plugin as connected until a real connection test succeeds.
- Do not enable real payment processing as a side effect of connector work.

## Implementation slices

1. Images and creative templates.
2. Customer OAuth connection framework and provider UI.
3. Customer remote MCP connections and permission-aware tool execution.
4. OpenAI Responses and Gemini native tool adapters.
5. Unified Plugins status, integration checks, docs, security review and production verification.

## Verification

For every slice: run repository typecheck and production build, run focused tests where practical, inspect the Git diff and latest workflow results, and verify meaningful public runtime behavior after deployment. Any integration needing owner-provided OAuth credentials or unapplied migrations remains explicitly marked pending until real credentials and provider tests succeed.
