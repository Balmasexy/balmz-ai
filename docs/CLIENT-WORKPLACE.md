# BALMZ AI client workplace

## Client experience

The authenticated `/dashboard` route is a responsive ChatGPT-style workspace with:
- A collapsible conversation sidebar, new-chat action, and local conversation search.
- A central assistant conversation view with user/assistant message styling, copy action, and responsive composer.
- Prompt starters for writing, learning, building, and exploring.
- Mobile navigation drawer and touch-sized controls.
- Account identity, subscription label, and Super Admin link when the server confirms the user's admin role.

Conversation drafts and history are stored in the current browser's local storage. They are not yet synchronized between devices or backed up to Neon. Clearing browser storage removes that local history. A future cloud-history release needs a reviewed forward-only migration and per-user ownership constraints.

## Brand color

The landing page's `--balmz-orange` token is the single source of truth. All Tailwind orange shades (300–600) resolve to that same token so text, active navigation, buttons, focus rings, and highlights do not drift to lighter/darker orange variants.

## AI request path

The browser sends the current conversation to `POST /api/ai/chat`. The server:
1. Requires a valid Better Auth session.
2. Requires a server-resolved active/trialing subscription.
3. Requires the server-only `OPENAI_API_KEY`.
4. Validates message roles, sizes, and turn ordering.
5. Reserves one `ai_messages` usage unit through the existing atomic usage service.
6. Calls the OpenAI Chat Completions API using the allow-listed `gpt-4.1-mini` model (or `gpt-4.1` when explicitly selected in server configuration).
7. Returns only the assistant text and model identifier; provider credentials never reach the browser.

The client offers `gpt-4.1-mini` and `gpt-4.1`; the server independently enforces this allow-list and defaults unknown values to `gpt-4.1-mini`.

## Enablement gates

- Configure `OPENAI_API_KEY` as a Render secret.
- Configure at least one enabled plan with an integer `entitlements.limits.ai_messages` allowance.
- Assign the plan through a verified subscription flow before users can send billable AI requests.
- No plan, price, payment, usage allowance, or account record is fabricated by this UI release.

Gemini, X, and BALMZ API adapters are not represented as connected until their server-side credentials, provider-specific permissions, quotas, and verification are implemented. File uploads, voice, and cloud-synchronized conversation history are not part of this release.
