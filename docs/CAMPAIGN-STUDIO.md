# Campaign Studio

The authenticated Campaign Studio is available at `/dashboard/campaign-studio`.

## Inputs and outputs

Members provide a campaign brief, target audience, product or service facts, tone and up to eight requested channels. The OpenAI Responses API generates:

- One concise campaign concept with audience insight and key message.
- Exactly three channel-specific headline/body/CTA variants.
- A launch checklist of actionable tasks.
- A visual-generation prompt, with optional generated campaign image.

The prompt explicitly tells the model not to invent product features, prices, statistics, testimonials, guarantees, awards, performance claims or legal statements. Verify any unprovided facts before launch.

## Credentials and API behavior

The route resolves an enabled, successfully tested OpenAI connection saved by Super Admin, or falls back to the server-only `OPENAI_API_KEY` Render environment variable. It never accepts an API key from the browser and never uses General Language as a Responses endpoint. Model selection uses the saved OpenAI connection model, or `OPENAI_RESPONSES_MODEL_ID`, `OPENAI_MODEL_ID`, then the configured default.

The backend calls `POST https://api.openai.com/v1/responses` for copy. Optional image creation uses the Responses `image_generation` tool with the configured `OPENAI_IMAGE_MODEL_ID` (default `gpt-image-2.5-flare`). Text and image errors are handled independently: the campaign copy and visual prompt can still be saved if the image call fails.

## Persistence and privacy

Campaign records are saved in the existing `public.balmz_notes` table with the signed-in user's `user_id` and a dedicated Campaign Studio title prefix. The history query is always scoped to the current account. No database migration is required. Only the campaign copy, brief inputs and visual prompt are retained; generated image bytes are returned to the browser for the current page session and are not written into campaign history.

Responses requests use `store: false` and a stable, privacy-preserving `safety_identifier`. Keys remain server-side and are never returned to a user.

## Usage and provider costs

Campaign copy reserves one `ai_messages` unit. Optional image generation reserves one additional unit before the image request. Both operations are subject to the user's active plan limits. OpenAI API usage can also incur charges under the connected OpenAI API account.

## Not included

Video generation is not part of this release. The OpenAI Sora API was discontinued on 24 September 2026, so BALMZ AI does not call the retired endpoint. A separate video provider and its credentials are required before adding a supported video-generation workflow.
