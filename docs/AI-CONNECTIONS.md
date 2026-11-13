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
- General Language API (any public HTTPS OpenAI-compatible chat endpoint)

OpenAI-compatible providers use their provider-specific HTTPS API endpoints. Anthropic and Gemini use their native Messages and generateContent APIs. Model names are entered exactly as provided by the model vendor; BALMZ AI does not invent a provider's available model list.

### General Language API

The General Language API connector supports vendors exposing an OpenAI-compatible `GET /models` catalogue and `POST /chat/completions` endpoint. Configure these three server-only Render environment variables:

- `GENERAL_LANGUAGE_API_KEY`
- `GENERAL_LANGUAGE_API_BASE_URL` (public HTTPS base URL, such as `https://api.vendor.com/v1`)
- `GENERAL_LANGUAGE_API_MODEL` (exact provider model identifier)

The Super Admin can then choose **General Language API**, load the available models using the existing server credential, and connect the selected model without pasting a key into the browser. The endpoint is validated as HTTPS and private/reserved IP destinations are rejected. Redirects are disabled for provider requests.

Migration `0008_general_language_api_provider.sql` adds the provider ID and endpoint URL column. Apply it using the Neon migration/owner role before connecting this provider. Existing provider records are preserved.


## Database migration

Apply db/migrations/0002_ai_provider_connections.sql to the production balmz_ai database using the migration/owner role. To enable General Language API, also apply db/migrations/0008_general_language_api_provider.sql before deploying the feature. Do not run migrations with the restricted application role if it lacks DDL permission.

This additive migration creates balmz_ai_provider_connections and records version 0002 in balmz_schema_migrations. It does not change users, sessions, subscriptions, payment records, or usage counters.

## Add a connection without re-entering an API key

1. Configure the provider key once in the Render environment using the matching name in `.env.example`, such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`.
2. Open /admin → **AI connections** and select the provider.
3. Choose **Load available models**. BALMZ AI resolves the credential from the Render environment first, then from an existing encrypted connection. The browser never receives the key.
4. Select the model and choose **Connect using available credential**. BALMZ AI tests the resolved key/model pair before storing the encrypted connection.
5. Once connected, the model appears in the signed-in Chat model selector.

A key can still be entered once in the optional field when no Render or saved credential exists. This is a fallback, not a requirement when the server already has a credential. Failed tests are not saved.

## Credential protection

API keys are encrypted before they are inserted into Neon using AES-256-GCM. The encryption key is derived from the server-only BETTER_AUTH_SECRET; rotating that secret without re-encrypting stored credentials will make existing provider keys unreadable. Plan credential migration before rotating the Better Auth secret.

Only the server decrypts provider keys. API routes require a current authenticated session, and provider management additionally requires the database-confirmed Super Admin role. The Chat API retains its existing subscription check and ai_messages usage reservation.

## Provider billing and limits

A connected provider key does not make that provider free. Requests are billed or limited under the corresponding provider account. BALMZ AI currently uses a one-model-per-connection record and a shared text chat adapter; image generation, audio, embeddings, provider-native tool execution and full MCP server registration are not enabled by this connector release.

## Troubleshooting

- If the page asks for migration 0002, apply the SQL migration and refresh.
- If no key is entered and no Render/saved credential exists, the provider cannot be authenticated. Add the provider key once to Render's encrypted environment settings; do not expect a provider's public name or catalogue to grant API access.
- If the provider returns HTTP 429, BALMZ AI reads the provider's `Retry-After` header when available and displays the suggested wait. Do not repeatedly click **Load available models**, **Connect & test**, or **Test again** while the provider is rate-limiting the key/account.
- When model catalogue access is rate-limited, select **Enter a custom model ID** and enter the exact model identifier shown in the provider's own console/documentation. This avoids repeated catalogue calls; the connection test still sends one real, small provider request and may also be rate-limited.
- A 429 during **Test again** does not downgrade a previously connected model or clear its last successful test timestamp. Authentication failures, invalid model IDs and other definitive test failures remain visible as failed tests.
- If a test fails, verify the provider key is active, the model ID exists, and the account has API access, quota and credit.
- If a stored provider stops responding, wait for the provider's reset window before selecting **Test again**.
- The provider connection is available to user accounts only after the authenticated chat UI receives it from /api/ai/models.
