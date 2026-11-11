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
- `/api/auth/*`: Better Auth endpoints
- `/api/health/db`: safe database connectivity probe
- `/api/subscription`: authenticated, server-derived subscription status
- `/mcp`: Apps SDK MCP server

## Neon database

The dedicated Neon project is named **BALMZ AI** and uses the `balmz_ai` database. The schema migration is:

`db/migrations/0001_identity_and_subscription_foundation.sql`

It creates the Better Auth core tables and BALMZ plan, subscription, payment-event, usage, audit, and migration-history tables. The matching applied migration is recorded as version `0001` in `balmz_schema_migrations`.

The app runtime role is `balmz_ai_app`, scoped to read/write database access on the `public` schema. Schema migrations should be run using a separate owner/migration credential, not the runtime role.

## Accounts and subscriptions

The account foundation uses Better Auth with HTTP-only cookies and database-backed sessions. Public registration cannot assign administrative roles. Passwords are processed by Better Auth; application code must not store or log clear-text passwords.

Subscription status and entitlements are read from PostgreSQL on the server. Usage is reserved in database transactions with an idempotency key and a monthly UTC counter. Missing limits or missing active subscriptions fail closed.

Transactional email is not configured yet, so password-reset delivery and mandatory email verification are not active. Configure a verified email provider and its server-side credentials before enabling those workflows.

## Payments

Payments are intentionally disabled at this stage. No plan price or entitlement has been seeded, and no browser redirect is allowed to activate a subscription. Paystack initialization, signature-verified webhooks, idempotent event processing, verification, and reconciliation belong in a separate release after pricing and merchant credentials have been confirmed.

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
