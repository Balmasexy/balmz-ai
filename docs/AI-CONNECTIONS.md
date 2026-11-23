# AI provider and agent connections

The Super Admin manages external model providers from **Super Admin → AI Connections**. Tested connections appear in the signed-in chat model selector. Provider keys are encrypted on the server before they are stored in Neon; the browser receives only safe model and connection metadata.

## Supported chat providers

- OpenAI
- Anthropic Claude
- Google Gemini
- xAI Grok
- OpenRouter
- DeepSeek
- Groq
- Mistral
- Together AI
- Fireworks AI
- General Language API (a public HTTPS OpenAI-compatible chat endpoint)

Anthropic and Gemini use their native provider APIs. The other chat adapters use the provider's OpenAI-compatible chat endpoint. Model IDs must match the provider's actual catalogue; BALMZ AI does not invent model access.

## OpenAI connection and Responses API features

Connect OpenAI from **Super Admin → AI Connections** using a key and a tested model, or configure `OPENAI_API_KEY` as a server-only Render environment variable and connect using the available environment credential. Do not paste keys into chat prompts, source control, client storage or support messages.

The regular BALMZ AI chat adapter uses the provider's chat-completions-compatible interface for its supported text/chat models. The Campaign Studio uses the current OpenAI Responses API directly for structured campaign generation and optional image-generation tool calls; it does not use the legacy Completions endpoint. The Responses feature requires a real OpenAI API key and access to the configured model. An OpenAI connection that works for regular chat is not, by itself, proof that every Responses or image model is enabled on that API account.

## General Language API

The General Language API connector supports vendors exposing an OpenAI-compatible `GET /models` catalogue and `POST /chat/completions` endpoint. Configure these server-only Render environment variables:

- `GENERAL_LANGUAGE_API_KEY`
- `GENERAL_LANGUAGE_API_BASE_URL` (public HTTPS base URL)
- `GENERAL_LANGUAGE_API_MODEL` (exact model identifier)

The endpoint is validated as HTTPS and private/reserved IP destinations are rejected. Redirects are disabled for provider requests. General Language works for chat and ChartGPT through the compatible chat interface. It is not assumed to support OpenAI's proprietary Responses or image-generation endpoints.

## ChartGPT

ChartGPT first reuses a tested, enabled OpenAI or General Language connector (or the corresponding server-side environment configuration). It validates the selected chart fields against the supplied data and renders from the user's actual values. A dedicated ChartGPT Team service credential remains an optional fallback when no supported chat provider can generate the chart. The AI does not supply replacement or fabricated chart data.

## Campaign Studio

Campaign Studio is available at `/dashboard/campaign-studio`. It accepts the brief, target audience, product details, tone and requested channels, then uses the OpenAI Responses API to create a campaign concept, exactly three copy variants, a launch checklist and an image prompt. It can optionally request a generated campaign image using the Responses API image-generation tool. Generated campaign copy and prompts are saved in the signed-in user's existing private notes records; generated image bytes are returned for the current page session and are not retained in campaign history.

Campaign generation and optional image generation are each metered against the user's server-side `ai_messages` allowance. OpenAI API usage may be billed separately. The generator instructs the model not to invent product features, pricing, performance statistics, testimonials, guarantees or legal claims.

## Runway image and video generation

The authenticated Images workspace at `/dashboard/images` includes Runway media generation. Configure the project API key as the server-only Render environment variable `RUNWAYML_API_SECRET`; do not put it in browser code, `NEXT_PUBLIC_*` variables, source control or user prompts. The credential is used only by the server-side Runway SDK.

The studio supports text-to-image with Runway `gen4_image`, text-to-video with `gen4.5`, and image-to-video with `gen4.5`. Generation is asynchronous: BALMZ AI stores the user's job metadata in the existing account-scoped `public.balmz_notes` table and polls the Runway task status. No schema migration is required. Each generation reserves one `ai_messages` allowance unit; Runway API credits are billed separately by the Runway project. Project permissions, available model access and an available Runway API credit balance are required.

Runway output URLs are temporary and expire within approximately 24–48 hours. The studio displays the generated media and offers an open/save action; users should download completed files promptly. BALMZ AI does not claim that temporary provider URLs are permanent media storage.

Video generation is provided by Runway rather than the retired Sora API endpoint.

## Credential protection and usage

Only server routes decrypt saved provider keys. AI connection management and provider selection are protected by an authenticated session and the database-confirmed Super Admin role. User AI features require an active BALMZ AI subscription and reserve server-side usage against `ai_messages` with idempotency keys.

Rotating `BETTER_AUTH_SECRET` without re-encrypting stored provider keys makes those keys unreadable; plan credential migration before rotating the secret.

## Troubleshooting

- If no provider appears in the model selector, connect and test a real key/model pair.
- If the page reports that a provider credential is not configured, add the key to the Render service environment or save it through the protected AI Connections form.
- A provider name in the plugin directory does not grant API access or provider credit.
- A 401/403 means the provider rejected the key or model access; reconnect a valid key.
- A 429 means a provider rate limit has been reached; wait for the provider's reset window before retrying.
- For image generation, confirm the OpenAI API project has access to the selected GPT Image model and sufficient API quota. Image generation may fail independently while campaign copy remains available.
