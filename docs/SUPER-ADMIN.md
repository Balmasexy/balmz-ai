# BALMZ AI Super Admin

## Access model

The control center lives at `/admin` and is available only to an authenticated BALMZ AI account whose server-loaded Better Auth user record has `role = 'admin'`. The API at `/api/admin/overview` applies the same server-side check. Client-provided role values are never accepted as authorization.

The existing identity migration already constrains roles to `user`, `admin`, and `support`. In this release, `admin` is the highest BALMZ AI administrative role; PWFB role names are not copied into BALMZ AI.

## Granting the first admin

Use a trusted database administration session (not a public API or browser console). First identify the intended account by its exact email, verify that it is the account owner, then run the following parameterized-equivalent SQL with the exact email substituted by the database operator:

```sql
UPDATE public."user"
SET role = 'admin', "updatedAt" = now()
WHERE lower(email) = lower('OWNER_EMAIL_HERE')
  AND "emailVerified" = true;
```

Confirm exactly one row was updated. If zero rows were updated, sign up/sign in to create the intended account first. Never grant admin to an unverified or unconfirmed email identity. Keep the Neon owner credential private; use the restricted runtime role for normal application traffic.

## Current scope

The dashboard reports account totals, latest user accounts, subscription records, payment records, usage counters, and audit history. The overview endpoint is read-only. Payment initiation, Paystack activation, role mutation, subscription overrides, usage-limit mutation, and terminal command execution are intentionally not exposed by this release.

PWFB Microfinance and BALMZ AI retain separate databases, sessions, credentials, and customer records.
