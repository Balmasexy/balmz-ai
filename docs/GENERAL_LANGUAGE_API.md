# General Language API

The General Language API is a provider-neutral AI connection for services that implement the OpenAI-compatible Chat Completions API. It allows BALMZ AI to connect a language model not already listed in the named provider catalogue.

## Super Admin setup

Open `/admin?section=ai-connections` and select **General Language API**.

Supply:
- A connection name.
- The provider's public HTTPS base URL.
- The provider API key.
- The exact model ID.

Use **Load available models** when the provider exposes an OpenAI-compatible `/models` endpoint. If it does not, select the manual model option and enter the exact model ID supplied by the provider. **Connect & test** sends a small test prompt before the connection is saved.

The provider endpoint is expected to support:

- `GET /models` (optional model discovery; manual model entry is available).
- `POST /chat/completions` (required text-generation route).
- Bearer-token authentication.
- OpenAI-compatible JSON request and response fields.

The endpoint must use HTTPS, must not include URL credentials, query parameters or fragments, and must resolve exclusively to public IP addresses. Local, private, reserved and link-local networks are blocked to prevent server-side request forgery. Redirects are disabled.

## Server-side Render configuration (alternative)

The same integration can be configured once in the BALMZ AI Render environment:

- `GENERAL_LANGUAGE_API_KEY`
- `GENERAL_LANGUAGE_API_BASE_URL`
- `GENERAL_LANGUAGE_API_MODEL`

When the complete server-side configuration exists, the Super Admin can select the existing Render connection without entering a key into BALMZ AI. The API key remains server-only. The UI receives only the connection name, provider, model, endpoint status and test metadata.

## Security and usage

- Connection management is restricted to the Super Admin.
- API keys are encrypted with AES-256-GCM using the existing server-only credential-encryption key before they are stored in Neon.
- Keys are never included in chat responses or returned by the connection API.
- All model requests run on the server and remain subject to the user's active BALMZ AI subscription and `ai_messages` allowance.
- Provider usage may be billed separately by the provider. BALMZ AI does not claim these external model calls are free.
- Image input is supported only when the selected provider model supports the OpenAI-compatible image content format.

The connection is not considered active until its server-side test request succeeds.
