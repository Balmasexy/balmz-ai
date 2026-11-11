# BALMZ AI client workplace

## Client experience

The authenticated `/dashboard` route is a responsive ChatGPT-style workspace with:
- Desktop conversation sidebar and a touch-friendly mobile navigation drawer.
- New chat, searchable recent history, per-conversation delete, and keyboard shortcut (Ctrl/Cmd + K).
- Central assistant conversation view, formatted text/code responses, copy controls, and a mobile-safe composer.
- Prompt starters for writing, learning, building, and research.
- A model selector whose allowed model IDs are independently enforced by the server.
- Server-backed conversation and message history, synchronized to the signed-in account rather than only the current browser.

## Conversation storage and ownership

The additive migration `db/migrations/0002_client_workspace_conversations.sql` (schema version `0005`) creates `balmz_conversations` and `balmz_messages`. Every query is scoped to the Better Auth user ID. A composite foreign key ties every message to the conversation owner, and delete cascades are limited to that conversation. The browser cannot select another user's conversation by changing its ID.

The app role `balmz_ai_app` receives only the SELECT, INSERT, UPDATE, and DELETE permissions needed for these two tables. Migration 0001 and existing account, subscription, payment, usage, webhook, and audit records are not modified.

## AI request path

The browser sends one new message and an optional conversation ID to `POST /api/ai/chat`. The server:
1. Requires a valid Better Auth session.
2. Validates the message and conversation ID.
3. Resolves the account's active/trialing subscription and reserves one `ai_messages` usage unit through the existing usage service.
4. Loads bounded previous messages from the authenticated user's Neon conversation.
5. Calls the OpenAI Chat Completions API using the server-only `OPENAI_API_KEY` and the server allow-list of `gpt-4.1-mini` and `gpt-4.1`.
6. Streams assistant text deltas to the client and persists the completed assistant reply, model, and provider response identifier.

The browser never receives the OpenAI key. Provider errors are reduced to safe messages and the upstream response body is not exposed.

## Enablement gates

Set `OPENAI_API_KEY` only in the Render service's server-side environment. AI replies also require an active/trialing subscription with an `ai_messages` allowance in the server-side plan entitlements. Missing provider credentials, subscription, or usage allowance fail closed; the UI must not invent balances or free quotas.

The production database currently has no subscription plans or subscriptions, so the interface can load, browse the account workspace, and persist chat drafts only after migration 0005 is applied, but actual model replies remain gated until a valid plan/allowance and provider configuration are present.

## Current limits

This release supports text conversations and code/text formatting. File uploads, image input, voice, web search, shared/team chats, and real Linux shell execution are not exposed as working controls until their respective authenticated services and safety limits exist.
