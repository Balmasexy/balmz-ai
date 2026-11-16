# BALMZ AI Bank Connections and ACH Integration

## Scope and page placement

- Bank Connections is a separate authenticated page at `/dashboard/banking`, reachable from Settings. It is intentionally not a dashboard card.
- ACH funding-source setup is at `/dashboard/banking/ach`.
- Provider credentials are managed only by Super Admin at `/admin` → Banking Secret Vault.
- Plaid Link is the only place the end user enters bank credentials or a bank one-time verification code. BALMZ AI must never collect or persist a bank password, OTP, PIN, or full account/routing number.

## Android app integration

The BALMZ AI Android build uses Plaid's official native Android Link SDK (version 6.4.0) through a local Capacitor bridge. The backend creates Android Link tokens with `android_package_name=com.balmz.ai`; it does not use the browser Link script inside the Android WebView. The web application continues to use Plaid Link Web.

Before Android bank login can work, add the exact package name `com.balmz.ai` to Plaid Dashboard → Build → API → Allowed Android package names. This is a one-time Plaid-side allowlist setting. The Android SDK requires Android API level 25 or newer.

Plaid's legacy WebView SDK is deprecated; the native Android SDK is used for the APK so bank app handoffs and OAuth/MFA are handled by the supported Android Link experience.

## Provider design

Plaid Auth + Plaid Link is used for bank sign-in/MFA and selected-account authentication. The backend exchanges the one-time public token for an access token and encrypts that access token using the server-side credential encryption mechanism. The selected account ID, account type/subtype, name and partial mask are stored for display and later processor-token creation.

NMI Money Movement (Dwolla-compatible API) is the selected ACH processor path. The backend creates a Plaid processor token for the selected account and passes that token directly as `plaidToken` to the provider when creating the funding source. BALMZ AI does not need to retrieve or store the user's full account number or routing number.

## Required credentials

Save credentials inside the Super Admin Banking Secret Vault. Do not paste secrets into chat or source code.

| Provider | Sandbox fields | Production fields |
|---|---|---|
| Plaid | Client ID + Sandbox Secret | Client ID + Production Secret |
| NMI Money Movement | API key + API secret | API key + API secret |

Plaid credentials can be added from the Plaid Developer Dashboard. A Plaid Client ID and Sandbox Secret are sufficient for Plaid Sandbox connection tests; they do not create an NMI customer or activate ACH.

NMI Money Movement credentials are issued to the business after onboarding and integration review. They cannot be generated from the Plaid Client ID or secret. Do not invent them or reuse credentials from an unrelated payment product.

## Environment variables

The optional server-side fallback variables are documented in `.env.example`:

- `PLAID_ENV=sandbox` or `production`
- `PLAID_CLIENT_ID`
- `PLAID_SANDBOX_SECRET` / `PLAID_PRODUCTION_SECRET`
- `PLAID_REDIRECT_URI` (register the exact URL in the Plaid dashboard when OAuth institutions require it)
- `NMI_MONEY_MOVEMENT_ENV=sandbox` or `production`
- `NMI_MONEY_MOVEMENT_SANDBOX_KEY` and `NMI_MONEY_MOVEMENT_SANDBOX_SECRET`
- `NMI_MONEY_MOVEMENT_PRODUCTION_KEY` and `NMI_MONEY_MOVEMENT_PRODUCTION_SECRET`
- `NMI_MONEY_MOVEMENT_LIVE_APPROVED=false`
- `NMI_CUSTOMER_KYC_AND_DISCLOSURE_APPROVED=false`

The Secret Vault stores credentials encrypted in `balmz_service_credentials`; API responses expose only safe status and metadata. The server-only environment variables are fallback-only. Never use `NEXT_PUBLIC_` prefixes.

## Database rollout

Apply migrations in order using the Neon owner/migration role after reviewing and backing up the database:

1. `db/migrations/0009_plaid_nmi_money_movement.sql`
2. `db/migrations/0010_plaid_bank_accounts.sql`

They are additive. They do not drop or rewrite existing rows. Do not apply them through the restricted `balmz_ai_app` runtime role. The production database currently has a verified migration baseline through `0008`; this feature branch does not apply migrations automatically.

## User flow

1. The signed-in user opens Settings → Bank connections.
2. Plaid Link opens the bank's own login and MFA/OTP flow.
3. The user selects a checking or savings account.
4. BALMZ AI exchanges the Plaid public token server-side, stores the encrypted access token and selected account metadata.
5. If NMI Sandbox credentials and a sandbox customer profile are configured, ACH funding-source activation creates a Plaid processor token and adds the funding source with NMI.
6. The UI shows bank-linked, funding-source-pending, or provider-verified separately. No fabricated bank balance or transfer status is shown.

## Production and transfer safety

Production ACH money movement is not activated by this code change. NMI requires its integration and risk review and written go-live approval before production money movement is enabled. Provider KYC/customer disclosure requirements must also be satisfied. The app intentionally has no live transfer-initiation control while these approvals are absent.

A successful Plaid login is not proof that the ACH funding source is verified. A verified funding source is not, by itself, approval for the platform to initiate real transfers. Only enable a production transfer capability after all provider approvals, business/KYB obligations, customer KYC, user agreements, webhook/reconciliation design, and an explicit owner release approval are complete.

## Acceptance tests

- Signed-out bank APIs return 401.
- User A cannot list, use, or disconnect User B's Plaid items, accounts, customers or funding sources.
- Plaid Client ID and secret never appear in API responses, app bundles, logs or database plaintext.
- Plaid Link handles bank MFA/OTP; BALMZ AI does not accept an OTP field.
- Wrong environment credentials are rejected.
- Only checking/savings deposit accounts can be activated as ACH sources.
- Plaid public tokens are exchanged once, and item ownership is enforced.
- NMI funding-source status is taken from the provider response; it is never assumed verified.
- Production customer/funding setup remains blocked until NMI's approvals and credentials are present.
- Transfer initiation remains off until a separate, reviewed transfer implementation is approved.
