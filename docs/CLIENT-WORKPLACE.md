# BALMZ AI client workplace

## Client experience

The authenticated `/dashboard` route is a responsive chat workspace with:
- A collapsible conversation sidebar, new-chat action and account-scoped conversation search.
- A central assistant conversation view, copy actions, prompt starters and responsive composer.
- Mobile navigation, photo/camera attachments, offline queueing and retry support.
- Account identity, subscription status and a Super Admin link when the server confirms the user's role.

The browser keeps an account-scoped local copy in local storage so drafts and recent conversations remain available on that device. The workspace synchronizes conversation metadata and text messages with Neon when the authenticated conversation endpoints are available. Local history is imported through `POST /api/ai/conversations`; the server list and per-conversation endpoints are owner-scoped. Clearing browser storage removes that device's local copy, but does not delete rows already synchronized to Neon.

## Chat and provider request path

The browser loads available tested models from `GET /api/ai/models` and sends a turn to `POST /api/ai/chat`. The server:
1. Requires a valid Better Auth session.
2. Resolves the active/trialing subscription and the server-side `ai_messages` allowance.
3. Validates message roles, ordering, text size, image formats and total attachment size.
4. For durable turns, checks conversation ownership before reserving billable usage.
5. Reserves one usage unit with a request idempotency key.
6. Calls the selected, enabled provider connection or a supported server-side environment configuration.
7. Returns the assistant reply and safe provider/model metadata. Provider credentials are never sent to the browser.

Supported chat connections include OpenAI, Anthropic, Google Gemini, xAI, OpenRouter, DeepSeek, Groq, Mistral, Together AI, Fireworks AI and General Language API. Gemini uses its native API adapter; Anthropic uses its native Messages API adapter. The other listed compatible providers, including General Language, use an OpenAI-compatible chat-completions interface. The selected model ID must actually be available to the provider account.

The General Language API is the provider-neutral connector for a public HTTPS OpenAI-compatible chat endpoint. Its server-side configuration uses `GENERAL_LANGUAGE_API_KEY`, `GENERAL_LANGUAGE_API_BASE_URL` and `GENERAL_LANGUAGE_API_MODEL`. Endpoint validation rejects private/reserved destinations and provider requests do not follow redirects. See [GENERAL_LANGUAGE_API.md](GENERAL_LANGUAGE_API.md).

## Durable conversation history and privacy

Migration `0007` adds `public.balmz_conversations` and `public.balmz_messages`. The composite owner foreign key ensures messages can only belong to a conversation owned by the same user. The authenticated endpoints are:
- `GET /api/ai/conversations`: list the signed-in user's conversations.
- `POST /api/ai/conversations`: import that user's account-scoped browser history.
- `GET /api/ai/conversations/:id`: load one owned conversation and its messages.
- `PATCH /api/ai/conversations/:id`: update the status of an unrecoverable queued image turn.
- `DELETE /api/ai/conversations/:id`: delete one owned conversation and its messages.

Text turns store request IDs, model/provider metadata and completion status so a retried request can reuse a saved assistant reply rather than call the model again. Assistant replies are saved as completed message rows; if the server cannot confirm that persistence, the main workspace warns that the reply remains on the current device and cloud history was not confirmed.

Image bytes are processed for the AI request but are not stored in the durable message table. The database records only whether a message had attachments. The browser may retain attachment data locally for its current session; after a reload, an attachment turn that cannot be recovered is marked failed rather than silently replayed without its image.

Quick Chat is a compact, page-level helper. It uses the same authenticated provider and subscription checks but keeps its short conversation in the current component session rather than the durable main-chat conversation history.

## Usage and access gates

- A valid Better Auth session is required for chat and model listing.
- A server-resolved active or trialing subscription is required before a model request.
- Every billable text turn reserves the plan's server-side `ai_messages` allowance; usage is idempotent by request ID.
- Provider usage may be billed separately by the provider. BALMZ AI does not represent external model calls as free.
- No plan, price, entitlement, allowance, connected provider or balance is fabricated by the client UI.

## Brand color

The landing page's `--balmz-orange` token is the single source of truth. All Tailwind orange shades (300–600) resolve to that same token so text, active navigation, buttons, focus rings and highlights remain consistent.
