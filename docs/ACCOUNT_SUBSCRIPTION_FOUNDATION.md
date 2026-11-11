# BALMZ AI account and subscription foundation

## Database

The dedicated Neon project is **BALMZ AI** and the application database is `balmz_ai`. The application connects only through the server-side `DATABASE_URL` environment variable. Never prefix it with `NEXT_PUBLIC_`, place it in browser code, or commit a real value.

The schema is created by `db/migrations/0001_identity_and_subscription_foundation.sql`:

- Better Auth core identity tables: `user`, `session`, `account`, and `verification`.
- Subscription catalogue and user subscription history.
- Payment records and webhook idempotency/event tracking tables reserved for the later Paystack phase.
- Monthly usage counters and append-only usage events.
- Administrative audit events and migration history.

The migration is idempotent and records version `0001`. The new database was verified after creation; no pre-existing application data was imported or changed.

## Authentication

Better Auth provides email/password registration and sign-in, database-backed sessions, and secure HTTP-only cookies. Passwords are handled by Better Auth; application code must never store plain-text passwords. Registration requires a password of at least 12 characters. User role is a server-managed field and is not accepted from public sign-up input.

Email verification and password-reset email delivery are not enabled yet because no transactional email provider has been configured. Configure and verify an email sender before making account recovery or verified-email-only workflows available.

## Server-side subscription and usage rules

The browser cannot set subscription status, plan entitlements, or usage counters. These are read and enforced on the server. Subscription plan rows start disabled; no paid plan, price, entitlement, or payment is seeded by this migration.

Plan entitlements use this JSON shape:

```json
{
  "limits": {
    "requests": 1000,
    "tokens": 250000
  }
}
```

`consumeUsage` in `lib/subscriptions.ts` locks the user's current subscription and usage counter in one database transaction, enforces the configured monthly UTC limit, and uses an idempotency key to prevent duplicate consumption. Missing limits fail closed rather than granting unlimited usage.

## Environment variables

Configure these only in the server's secret/environment settings:

- `DATABASE_URL`: Neon PostgreSQL URL for the `balmz_ai` database, with TLS required in production.
- `BETTER_AUTH_SECRET`: unique random secret of at least 32 characters.
- `BETTER_AUTH_URL`: canonical public URL, e.g. `https://balmz-ai.onrender.com`.
- `BETTER_AUTH_TRUSTED_ORIGINS`: comma-separated exact trusted origins, normally only the canonical app origin.

A `.env.example` is provided as a template. Do not commit real values. The Render service currently tracks `main`; do not attach the production database URL or deploy this feature branch until the reviewed branch is ready to be promoted.

## Verification

After dependency installation and runtime configuration:

1. Run `pnpm exec tsc --noEmit`.
2. Run `pnpm run build`.
3. Check `GET /api/health/db` returns `{ "status": "ok", "database": "connected" }`.
4. Check Better Auth's schema with `pnpm dlx auth@latest check schema --config ./lib/auth.ts`.
5. Perform a registration, sign-in, session refresh, and sign-out round trip against a non-production environment.
6. Check `GET /api/subscription` returns 401 when signed out and a server-derived subscription (or null) when signed in.

## Billing is deliberately not active

There is no Paystack initialization route, no webhook that grants entitlements, and no subscription status update based on browser redirects. Payment enablement is a separate phase after pricing, plan allowances, merchant credentials, webhook verification, and reconciliation are confirmed.
