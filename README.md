# BALMZ AI

BALMZ AI is an AI workplace built with Next.js and the OpenAI Apps SDK. The current foundation includes a branded web entry page, email/password identity, server-managed sessions, isolated Neon PostgreSQL storage, subscription records, and server-side usage accounting.

## Stack

- Next.js 15 and React 19
- Better Auth for email/password identity and sessions
- PostgreSQL on a dedicated Neon project
- Render for hosting
- OpenAI Apps SDK / MCP route at `/mcp`

## Local development

1. Install dependencies with the repository's pinned pnpm version:

   ```bash
   corepack enable
   pnpm install
   ```

2. Copy `.env.example` to `.env.local` and set the required server-only values:

   - `DATABASE_URL`: TLS-enabled connection string for the dedicated `balmz_ai` database. Use the `balmz_ai_app` database role for application runtime access.
   - `BETTER_AUTH_SECRET`: a unique random secret with at least 32 characters.
   - `BETTER_AUTH_URL`: the app's canonical HTTPS origin.
   - `BETTER_AUTH_TRUSTED_ORIGINS`: comma-separated exact origins allowed to initiate authenticated browser requests.

   Do not use a `NEXT_PUBLIC_` prefix for database credentials or authentication secrets. Never commit `.env.local` or real credentials.

3. Start the development server:

   ```bash
   pnpm dev
   ```

4. Verify type safety and production output:

   ```bash
   pnpm typecheck
   pnpm build
   ```

## Application routes

- `/`: BALMZ AI landing page
- `/sign-up`: email/password registration
- `/sign-in`: email/password sign-in
- `/dashboard`: authenticated account and subscription overview
- `/admin`: responsive Super Admin workplace with live Neon monitoring, private file storage, AI provider connections, and a restricted diagnostics console
- `/dashboard/deployments`: Render-style service workspace with service overview, deployment history, logs, metrics, storage and read-only settings
- `/manifest.webmanifest`: BALMZ AI installable web app manifest
- `/admin`: protected Super Admin workplace with live Neon monitoring and a restricted diagnostics console
- `/api/auth/*`: Better Auth endpoints
- `/api/health/db`: safe database connectivity probe
- `/api/subscription`: authenticated, server-derived subscription status
- `/mcp`: Apps SDK MCP server

## Neon database

The dedicated Neon project is named **BALMZ AI** and uses the `balmz_ai` database. The schema migration is:

`db/migrations/0001_identity_and_subscription_foundation.sql` and `db/migrations/0002_ai_provider_connections.sql`

It creates the Better Auth core tables and BALMZ plan, subscription, payment-event, usage, audit, and migration-history tables. The matching applied migration is recorded as version `0001` in `balmz_schema_migrations`.

The app runtime role is `balmz_ai_app`, scoped to read/write database access on the `public` schema. Schema migrations should be run using a separate owner/migration credential, not the runtime role. Migration `0002` adds encrypted AI provider connection records; it is additive and does not alter account, subscription, payment or usage records.

## Accounts and subscriptions

The account foundation uses Better Auth with HTTP-only cookies and database-backed sessions. Public registration cannot assign administrative roles. Passwords are processed by Better Auth; application code must not store or log clear-text passwords.

Subscription status and entitlements are read from PostgreSQL on the server. Usage is reserved in database transactions with an idempotency key and a monthly UTC counter. Missing limits or missing active subscriptions fail closed.

Transactional email is not configured yet, so password-reset delivery and mandatory email verification are not active. Configure a verified email provider and its server-side credentials before enabling those workflows.

## Payments

Payments are intentionally disabled at this stage. No plan price or entitlement has been seeded, and no browser redirect is allowed to activate a subscription. Paystack initialization, signature-verified webhooks, idempotent event processing, verification, and reconciliation belong in a separate release after pricing and merchant credentials have been confirmed.

## Android application

The project includes a Capacitor 8 Android wrapper for `com.balmz.ai` that opens the production Render app and uses the BALMZ shield logo for its launcher/splash assets. APK/AAB builds run through `.github/workflows/android-build.yml`. See `docs/ANDROID-RELEASE.md` for build artifacts and the optional private upload-key setup required for a Play Store signed release.

## Render deployment

The Render web service is `balmz-ai` and uses the repository's `main` branch. Build command:

```bash
pnpm install --frozen-lockfile && pnpm run build
```

Start command:

```bash
pnpm run start
```

Set all secret variables in Render's environment settings. Promote the reviewed feature branch to `main` only after CI and review pass. Do not trigger a production deploy solely to test a local code change.

## CI

GitHub Actions runs dependency/lockfile synchronization, TypeScript checking, and a Next.js production build for:

`feature/balmz-ai-workplace-neon-paystack`

It also runs on pull requests targeting `main`.


## AI provider connections

The Super Admin can connect OpenAI, Anthropic, Google Gemini, xAI, OpenRouter, DeepSeek, Groq, Mistral, Together AI and Fireworks AI from the AI Connections section. Provider keys are encrypted server-side and only tested model metadata is sent to the client workplace. See `docs/AI-CONNECTIONS.md`.

## Super Admin object storage

Use the private Cloudflare R2 archive for project files and deployment exports that must survive Render builds and restarts. Configure the R2 environment variables on the Render service and follow the bucket CORS/security instructions in `docs/SUPER-ADMIN-STORAGE.md`.
