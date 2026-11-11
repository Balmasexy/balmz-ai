# AI provider and agent connections

The Super Admin can manage external model providers from /admin → **AI connections**. Tested connections appear in the model selector in the client workplace.

## Supported providers

- OpenAI
- Anthropic Claude
- Google Gemini
- xAI Grok
- OpenRouter (one key can reach a broad model catalogue)
- DeepSeek
- Groq
- Mistral
- Together AI
- Fireworks AI

OpenAI-compatible providers use their provider-specific HTTPS API endpoints. Anthropic and Gemini use their native Messages and generateContent APIs. Model names are entered exactly as provided by the model vendor; BALMZ AI does not invent a provider's available model list.

## Database migration

Apply db/migrations/0002_ai_provider_connections.sql to the production balmz_ai database using the migration/owner role. Do not run it with the restricted application role if it lacks DDL permission.

This additive migration creates balmz_ai_provider_connections and records version 0002 in balmz_schema_migrations. It does not change users, sessions, subscriptions, payment records, or usage counters.

## Add a connection

1. Open /admin → **AI connections**.
2. Select a provider, connection name, and exact model ID.
3. Paste its API key into the password field and select **Connect & test provider**.
4. BALMZ AI sends a small one-word test request before saving the credential. A provider may charge for this request. Failed tests are not saved.
5. Once connected, the model appears in the signed-in Chat model selector.

The original API key is not returned to the browser after saving.

## Credential protection

API keys are encrypted before they are inserted into Neon using AES-256-GCM. The encryption key is derived from the server-only BETTER_AUTH_SECRET; rotating that secret without re-encrypting stored credentials will make existing provider keys unreadable. Plan credential migration before rotating the Better Auth secret.

Only the server decrypts provider keys. API routes require a current authenticated session, and provider management additionally requires the database-confirmed Super Admin role. The Chat API retains its existing subscription check and ai_messages usage reservation.

## Provider billing and limits

A connected provider key does not make that provider free. Requests are billed or limited under the corresponding provider account. BALMZ AI currently uses a one-model-per-connection record and a shared text chat adapter; image generation, audio, embeddings, provider-native tool execution and full MCP server registration are not enabled by this connector release.

## Troubleshooting

- If the page asks for migration 0002, apply the SQL migration and refresh.
- If a test fails, verify the provider key is active, the model ID exists, and the account has API access or credit.
- If a stored provider stops responding, select **Test again** or reconnect it.
- The provider connection is available to user accounts only after the authenticated chat UI receives it from /api/ai/models.
