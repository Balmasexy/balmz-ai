# Customer AI tools: OpenAI Responses and Google Gemini

The customer AI Tools workspace is available at `/dashboard/ai-tools`. It uses the Super Admin's saved and tested OpenAI or Google Gemini provider connection, or the corresponding server-side Render environment credential. Provider keys never reach the browser.

## OpenAI Responses

The workspace uses `POST https://api.openai.com/v1/responses`, not the Chat Completions endpoint. It can enable:

- Web search (`web_search`)
- Code Interpreter (`code_interpreter`)
- Image generation (`image_generation`)
- File search only when one or more private, user-owned vector stores are explicitly supplied by a future customer file-store integration.

The first version does not enable shell execution, computer use or provider-mediated remote MCP. BALMZ has not yet deployed an isolated computer-use/shell sandbox or the secure user-scoped file-store binding required for those capabilities. Customers can manage their own remote MCP servers separately in **My Connections**; provider-mediated MCP forwarding is intentionally not enabled by this tool route.

The OpenAI tool workspace uses the configured Responses model. If no model is specified in Render, it defaults to `gpt-6-astra`; override with `OPENAI_RESPONSES_MODEL_ID`. The model/account must support the requested tools. A successful Chat Completions test alone does not prove Responses feature access.

## Google Gemini

The workspace uses Gemini's native `generateContent` API and tool declarations. The published model allowlists gate:

- Google Search (`google_search`)
- Google Maps grounding (`google_maps`)
- URL context (`url_context`)
- Python code execution (`code_execution`)

The availability of these features differs by model. For example, the default `gemini-3.1-flash-lite` is enabled for Maps grounding, URL context and code execution, but the current Google Search model table does not list that model. The interface therefore leaves Google Search unavailable for it. `GEMINI_MODEL_ID` can override the default; model capabilities are still checked.

Gemini File Search, computer use, and custom function execution remain disabled in the current workspace. File Search needs a separately provisioned customer-owned file store; computer use needs isolated execution and a user-control layer; and custom functions need registered server-side handlers and approval contracts. These must not be represented as available before those systems exist.

## Usage and billing

Every tool-enabled task reserves one BALMZ AI `ai_messages` unit through the existing subscription accounting. The Free plan allowance remains 50 messages each month; Super Admin remains unlimited. This BALMZ usage unit is separate from provider billing. OpenAI and Google may charge separately for model tokens, image generation, grounded searches, Maps queries or other tool usage according to the provider account's plan and pricing.

The API logs only request metadata (provider, model, selected tool IDs and request ID). It does not intentionally store the prompt, raw provider key, private file contents or tool output in the audit event.

## Setup

1. Open **Super Admin → AI Connections**.
2. Connect and test an OpenAI model and/or Google Gemini model.
3. Confirm the selected model is available for the Responses or Gemini feature requested.
4. Open **Plugins → OpenAI Responses tools** or **Gemini native tools**.
5. Choose a connected model, select only the enabled tools and submit the task.

The `.env.example` file documents optional `OPENAI_RESPONSES_MODEL_ID` and `GEMINI_MODEL_ID` overrides. Configure actual provider keys only in Render's encrypted environment or the protected AI Connections screen.

## Official provider references

- OpenAI Responses API: https://developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI tools: https://developers.openai.com/api/docs/guides/tools
- Gemini model-specific Google Search grounding: https://ai.google.dev/gemini-api/docs/google-search
- Gemini Google Maps grounding and supported models: https://ai.google.dev/gemini-api/docs/maps-grounding
- Gemini URL context: https://ai.google.dev/gemini-api/docs/url-context
- Gemini code execution: https://ai.google.dev/gemini-api/docs/code-execution