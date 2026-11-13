# BALMZ AI

BALMZ AI is a branded AI workplace for individual users and teams, built with Next.js, React, Better Auth, Neon PostgreSQL, Render and Capacitor. The application provides authenticated chat, model selection, photo/camera attachments, Quick Chat, ChartGPT, a plugin directory, subscription entitlements, usage accounting and a protected Super Admin workspace.

## Stack

- Next.js 15.5 and React 19
- Better Auth for email/password identity and server-managed sessions
- PostgreSQL on a dedicated Neon project
- Render for production hosting
- OpenAI Apps SDK / MCP route at `/mcp`
- Capacitor 8 Android wrapper (`com.balmz.ai`)

## Production

- Web application: https://balmz-ai.onrender.com
- Production host: Render
- Source branch: `main`
- Database: Neon project BALMZ AI, database `balmz_ai`
- Application runtime database role: `balmz_ai_app`

Render automatically deploys reviewed commits merged into `main`. Do not treat a GitHub Vercel preview status as the Render production deployment status.

## Local development

1. Enable Corepack and install dependencies with the pinned pnpm version:

   ```bash
   corepack enable
   pnpm install
   ```

2. Copy `.env.example` to `.env.local` and set server-only credentials.

3. Start the local development server:

   ```bash
   pnpm dev
   ```

4. Run the core verification commands:

   ```bash
   pnpm run typecheck
   pnpm run build
   ```

Never commit `.env.local`, access tokens, private keys, payment credentials or production database passwords. Do not use `NEXT_PUBLIC_` prefixes for secrets.

## Main application routes

- `/`: BALMZ AI landing page
- `/sign-up`: account registration
- `/sign-in`: account sign-in and email-verification recovery
- `/forgot-password`: request a password-reset email
- `/reset-password`: set a new password from a valid reset link
- `/dashboard`: authenticated chat workplace
- `/dashboard/plugins`: plugin and connector directory
- `/dashboard/charts`: ChartGPT workspace
- `/dashboard/usage`: usage and allowance details
- `/dashboard/billing`: plan catalogue and billing workspace
- `/dashboard/settings`: profile and account settings
- `/dashboard/deployments`: protected Render service/deployment workplace
- `/admin`: protected Super Admin workplace
- `/api/subscription`: server-derived subscription status
- `/api/health/db`: database connectivity probe
- `/api/auth/*`: Better Auth endpoints
- `/api/auth/email-status`: safe transactional email readiness status
- `/mcp`: registered MCP tools endpoint

## Neon database and migrations

Use the dedicated Neon project and the `balmz_ai` database. The schema is versioned by additive SQL files in `db/migrations`; production records versions `0001` through `0008` in `public.balmz_schema_migrations` as of 13 November 2026. Migrations `0007` and `0008` were applied using the Neon owner role after a read-only baseline check; existing account, subscription, usage, payment, webhook and connector rows were preserved.

The migrations cover:

1. Identity, subscriptions, payments, usage and audit foundation.
2. Encrypted AI provider connections.
3. API keys, integrations and payment environments.
4. Paystack checkout-attempt records.
5. Subscription catalogue, trials and family-access grants.
6. One-time Pro trial redemption.
7. Account-owned durable chat conversations and idempotent chat turns.
8. General Language API provider ID and validated endpoint URL.

Run schema changes using a separate migration/owner credential after reviewing the SQL and taking the appropriate backup. The restricted `balmz_ai_app` runtime role is not the migration owner. Never drop or recreate the production database to fix a schema mismatch.

## Authentication and email delivery

Better Auth manages passwords and database-backed sessions. Public registration cannot assign administrative roles. Passwords must never be stored or logged in plain text.

Email verification and password-reset delivery use the Resend API when both server-side environment variables are configured:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Verify the sending domain and sender identity in Resend before configuring these values in the Render service. Once configured, new registrations require email verification; existing unverified accounts can request a new verification email from the sign-in page. Password resets revoke existing sessions. The owner must click the actual verification link; never mark a user verified by directly changing the database flag.

See [docs/AUTH_EMAIL_DELIVERY.md](docs/AUTH_EMAIL_DELIVERY.md).

## AI providers, ChartGPT and usage

The Super Admin can connect OpenAI, Anthropic, Google Gemini, xAI, OpenRouter, DeepSeek, Groq, Mistral, Together AI, Fireworks AI and General Language API from `/admin?section=ai-connections`. Connections are tested before saving, and credentials are encrypted server-side. The client receives safe provider/model metadata, not the original keys.

Provider connections are not created merely because a provider appears in the plugin directory. A real provider key and a valid model must be configured. Image understanding depends on the selected model supporting vision.

ChartGPT requires its own service credential from `/admin?section=service-connectors`. The Think harder option improves the requested chart/data review prompt; it is not a separate reasoning model.

AI requests require an active subscription and are metered against the server-side `ai_messages` allowance. Usage reservation uses a request idempotency key so a network retry does not count a second request.

See [docs/AI-CONNECTIONS.md](docs/AI-CONNECTIONS.md) and [docs/GENERAL_LANGUAGE_API.md](docs/GENERAL_LANGUAGE_API.md). The General Language API accepts a provider API key and public HTTPS OpenAI-compatible endpoint in Super Admin, or can use server-side `GENERAL_LANGUAGE_API_KEY`, `GENERAL_LANGUAGE_API_BASE_URL`, and `GENERAL_LANGUAGE_API_MODEL` values configured in Render.

See [docs/SERVER-SIDE-INTEGRATIONS.md](docs/SERVER-SIDE-INTEGRATIONS.md) for connecting service integrations directly from existing Render secrets without pasting API keys into the connector form.

## Subscription catalogue and trials

The database contains the Free, Pro Monthly, Pro Yearly, Pro 7-Day Trial and Family Complimentary plan records. The current catalogue defines server-side prices and `ai_messages` allowances. Subscription validity is determined from Neon, not from browser state or a payment redirect.

Family Access is an administrator-controlled complimentary grant with a shared workspace instruction and revocation/audit support. It does not expose a user's private conversation history to other members.

## Paystack payments

The Paystack integration includes checkout, verification and webhook processing code, but **production Demo and Live payment environments remain disabled until real merchant credentials are securely configured and the end-to-end payment lifecycle is verified**.

Do not activate Live mode based on a successful build or a browser callback. A subscription may become paid/active only after server-side verification of the provider transaction, expected reference, amount and currency, with idempotent webhook handling.

See [docs/PAYSTACK_BILLING_RUNBOOK.md](docs/PAYSTACK_BILLING_RUNBOOK.md).

## Super Admin storage

The File Storage workspace integrates a private Cloudflare R2 bucket for administrator uploads/archives. Configure a private bucket, bucket-scoped R2 token, credentials and CORS as described in [docs/SUPER-ADMIN-STORAGE.md](docs/SUPER-ADMIN-STORAGE.md). A storage directory listing is not evidence that the live bucket is connected; test upload, download, listing and deletion after configuring the real bucket.

## Android application

The project includes a Capacitor 8 wrapper for `com.balmz.ai`. It opens the Render-hosted web application and uses BALMZ branding. APK/AAB builds run through `.github/workflows/android-build.yml`.

The debug APK is suitable for device testing. A Play Store release requires the owner's upload keystore and four GitHub Actions secrets documented in [docs/ANDROID-RELEASE.md](docs/ANDROID-RELEASE.md). Do not describe unsigned release outputs as Play Store-ready. A CI build does not replace a physical-device smoke test.

## Render deployment

The Render web service uses the repository's `main` branch. Current commands:

```bash
pnpm install --frozen-lockfile; pnpm run build
pnpm run start
```

Set production credentials in the Render environment settings. Do not put secret values in source control, client bundles, logs or chat. Verify the actual Render deployment ID and status after merging; a green source build alone is not a production deployment.

## CI and release checks

GitHub Actions verifies TypeScript, the Next.js production build, feature checks and the Android artifact build on pull requests to `main` and configured branch pushes. Use the latest workflow runs for the exact commit under review; older green runs do not validate a newer commit.

Before a production release, validate:

- Registration, email verification, sign-in and password recovery.
- AI provider connection, model selection, metering, image input and chat retries.
- ChartGPT generation and data-quality handling.
- R2 upload, download, list and delete.
- Subscription/trial lifecycle, checkout, signed webhooks and reconciliation.
- Super Admin authorization, API-key scopes and audit events.
- Android build signatures and real-device behavior.
- Database row counts and existing account/subscription preservation.
