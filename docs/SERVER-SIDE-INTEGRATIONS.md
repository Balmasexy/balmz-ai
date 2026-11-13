# Server-side service integrations

The Super Admin Service Connector Hub at `/admin?section=service-connectors` can connect integrations using keys already configured on the Render service. The browser does not need the secret pasted into the form.

## How the direct connection path works

1. Add a service's documented key to Render's encrypted environment settings using the matching variable in `.env.example`.
2. Open the Service Connector Hub and select the integration.
3. BALMZ AI checks whether a matching Render variable exists and displays only a configured/not-configured status.
4. Select **Connect & save using Render secret**. The server resolves the secret, runs the integration's read-only connection test, encrypts it, and saves a connector record.
5. The connector appears in Saved connections and can be tested again or disconnected.

The server never returns the secret or displays its value. The optional per-connection credential form remains available when no server secret is configured.

## Supported environment-backed connectors

- ChartGPT: `CHARTGPT_API_KEY`
- CoinGecko Demo: `COINGECKO_DEMO_API_KEY` or `COINGECKO_API_KEY`
- CoinGecko Pro: `COINGECKO_PRO_API_KEY`
- GitHub: `GITHUB_TOKEN` or `GITHUB_PERSONAL_ACCESS_TOKEN`
- Render: `RENDER_API_KEY`
- Neon: `NEON_API_KEY`
- Notion: `NOTION_API_KEY` or `NOTION_TOKEN`
- Notes AI: `NOTES_AI_API_KEY`, `NOTES_AI_BASE_URL`, and `NOTES_AI_MODEL`
- Paystack Demo/Live: mode-specific secret plus `PAYSTACK_MODE`

Agentic.ai Directory is public and does not require an API key. It can be connected directly using its public read-only endpoint.

## Paystack safety

Connecting a Paystack secret only verifies and saves the credential. It does **not** enable checkout or settlement. Demo and Live payment modes remain disabled until the administrator explicitly enables the respective environment after the required credential and webhook checks pass. Never put Live keys into a Demo environment or vice versa.

## Acceptance checks

For each environment-configured integration:

- Confirm the status says configured without displaying the secret.
- Connect and save using the Render secret.
- Confirm the saved record shows connected and a recent successful test.
- Use the integration's actual feature (for example ChartGPT chart generation, GitHub repository listing, or Render service listing).
- Confirm missing/invalid credentials produce a clear status without making a fake connected record.
- Disconnect a saved connector and confirm the original Render secret is not deleted or modified.
