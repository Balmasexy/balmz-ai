# BALMZ AI Client Workplace

## Client experience

The authenticated /dashboard route is the BALMZ AI client workplace. It provides a responsive conversation layout with a desktop history sidebar, mobile navigation drawer, new chat, conversation search, saved conversations, delete controls, prompt starters, streaming responses, and a responsive message composer.

The workspace uses the same BALMZ landing-page orange token (#FF6900) across all Tailwind orange shade utilities. The CSS token maps orange-50 through orange-950 to the same color; opacity utilities may reduce intensity without changing the hue. The shield mark uses the same solid orange instead of a separate orange gradient.

## Authentication and data isolation

- The dashboard is server-rendered only after a Better Auth session is verified.
- Every conversation and message query is scoped to the authenticated database user ID.
- The messages table has a composite foreign key to (conversation_id, user_id) so a message cannot be attached to a conversation owned by a different user.
- The browser never receives the OpenAI API key.
- Message content is stored in Neon so the signed-in user can access their history across devices.
- Conversation deletion is scoped to the current user and cascades only to that conversation's messages.

## Database

Apply the additive migration db/migrations/0002_client_workspace_conversations.sql after reviewing it and taking the normal Neon backup. It creates balmz_conversations and balmz_messages, indexes for history and per-user message windows, and records migration version 0002. It does not edit migration 0001 or modify existing identity, subscription, payment or audit rows.

Do not expose the app until migration 0002 is applied to the database branch used by Render. Before applying it, test it on a temporary Neon branch and confirm the tables and constraints.

## OpenAI provider configuration

Set these variables on the BALMZ AI Render web service:

- OPENAI_API_KEY: server-only OpenAI API key.
- OPENAI_MODEL: model identifier available to the configured API project. The code defaults to gpt-6-astra when this value is omitted; set the model explicitly when needed.
- BALMZ_AI_CHAT_ENABLED: set to true to enable chat. Set to false to turn it off without removing the key.
- BALMZ_AI_DAILY_MESSAGE_LIMIT: per-account rolling 24-hour user-message limit; defaults to 25 and is capped at 250.
- BALMZ_AI_MAX_OUTPUT_TOKENS: per-response output limit; defaults to 1200 and is capped at 4000.

Never prefix the provider key with NEXT_PUBLIC_, place it in Capacitor config, or return it from any API route. Only safe status information (enabled state and model label) is sent to the client.

## Chat API

- GET /api/workspace/status: authenticated readiness status; never returns secrets.
- GET /api/workspace/conversations: list the authenticated user's most recent conversations.
- GET /api/workspace/conversations/:id: load messages only when the conversation belongs to the authenticated user.
- DELETE /api/workspace/conversations/:id: delete only the authenticated user's conversation.
- POST /api/workspace/chat: validates a bounded message, serializes per-user daily quota checks with a row lock, stores the user message, and streams OpenAI Responses API text deltas as newline-delimited JSON. The assistant message is persisted after the stream completes.

The chat route sends a bounded recent history, uses store=false, and applies a bounded output-token limit. It does not expose the upstream error body or provider credential. The API uses the OpenAI Responses API streaming events.

## Current limitations

The first release is text chat. File uploads, image input, voice, web search, model switching, shared/team conversations, and tool execution are not enabled by this implementation. Do not show controls that imply those functions work until their authenticated backend routes and safety limits are implemented.
