# Customer-owned account connections

BALMZ AI keeps personal account authorization separate from the shared Super Admin service vault. A user connects their own account while signed in; access tokens are encrypted at rest and every connection query is scoped to that user ID.

## Registered providers and callback URLs

Register a Web / Server application with each provider and configure its client ID and secret in the encrypted BALMZ AI Render environment. The production callback URL pattern is:

`https://balmz-ai.onrender.com/api/integrations/<provider>/callback`

Use these provider IDs:

- Google Workspace: `google` — `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Microsoft 365: `microsoft` — `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`
- Slack: `slack` — `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET`
- Dropbox: `dropbox` — `DROPBOX_OAUTH_CLIENT_ID`, `DROPBOX_OAUTH_CLIENT_SECRET`
- Box: `box` — `BOX_OAUTH_CLIENT_ID`, `BOX_OAUTH_CLIENT_SECRET`
- GitHub identity: `github` — `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`
- GitLab: `gitlab` — `GITLAB_OAUTH_CLIENT_ID`, `GITLAB_OAUTH_CLIENT_SECRET`
- Notion: `notion` — `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`

Do not place these values in source control, customer-visible settings, prompts, browser storage, or chat messages. The `.env.example` file lists variable names only.

## Permissions

The first release requests read-only scopes where providers support them:

- Google: OpenID profile plus Gmail readonly, Drive readonly and Calendar readonly.
- Microsoft: OpenID profile plus `Mail.Read`, `Files.Read.All`, `Calendars.Read` and `User.Read`.
- Slack: user-level channel read and message history read.
- Dropbox: account information, file metadata and file content read.
- Box: root read-only access.
- GitHub OAuth: profile and email identity only. Repository access requires a separately installed GitHub App with explicit repository selection.
- GitLab: read-user, read-api and read-repository.
- Notion: user-authorized workspace access according to the Notion integration's configured capabilities; Notion permissions are set in the integration console.

OAuth state is random, stored as a SHA-256 hash, bound to the authenticated BALMZ user and provider, expires after ten minutes, and is consumed once. PKCE S256 is used for providers configured to support it. Tokens and PKCE verifiers use AES-256-GCM authenticated encryption with distinct context labels. The encryption key is derived from the existing `BETTER_AUTH_SECRET`; keep that secret stable and follow a planned credential re-encryption procedure before rotating it, or saved OAuth tokens will need to be reconnected.

## First-party read-only account actions

The authenticated `/api/integrations/actions` workspace executes a fixed allowlist using the current customer's own decrypted access token. It does not accept arbitrary URLs or arbitrary provider API paths.

Available first-party actions:

- Google: Gmail search (headers/snippets only), Drive metadata listing, Calendar upcoming event metadata.
- Microsoft: Outlook message metadata/body previews, OneDrive root file/folder metadata, Calendar event metadata.
- Slack: public channel listing and message search.
- Dropbox and Box: root folder/file metadata listing.
- GitHub: connected account profile only. Repository access still requires a separate GitHub App installation and explicit repository selection.
- GitLab: membership project listing.
- Notion: search pages/databases available to the connected integration.

These actions are read-only. They do not send messages, edit files, create events, post to channels, transfer money, or change account settings. Provider requests use fixed HTTPS hosts, disable redirects, and return bounded metadata/previews rather than full file or mailbox contents. Requests are authenticated and owner-scoped. Expired access tokens are refreshed where a refresh token is available; otherwise the UI reports that the customer must reconnect.

These first-party actions are available from **My Connections → Connected account tools**. They are separate from remote MCP actions, which are customer-controlled. Remote MCP tool annotations are treated as untrusted metadata: every remote MCP invocation requires explicit user confirmation tied to the exact tool name and arguments, even when the remote server labels a tool as read-only. This fail-closed rule may also ask for confirmation before a remote search or read.

## Database rollout

The customer connection implementation uses additive migrations:

1. `db/migrations/0011_customer_oauth_connections.sql`
2. `db/migrations/0012_customer_remote_mcp_connections.sql`

**These migrations are not applied automatically and must not be run through the application runtime.** The current production migration baseline was previously documented through 0008, with banking migrations 0009 and 0010 also requiring separate owner-role review. Apply the complete migration chain in order using the Neon owner/migration role only after reviewing and backing up production. Existing user, message, subscription, payment and provider records are not rewritten by migrations 0011/0012.

Until the customer-connection migrations are applied, the OAuth API reports a schema-required status instead of pretending a connection can be stored.

## Connection lifecycle and ownership

- Start, callback, list, refresh and disconnect are authenticated.
- Callback consumes a state row only when state hash, provider and current user all match.
- Provider tokens are never included in API responses.
- The list endpoint returns safe identity, granted scope, expiration and connection status fields only.
- Refresh and disconnect require both connection ID and current user ID.
- Disconnect removes only the user's BALMZ credential. Provider revocation is attempted only where a documented endpoint is available; users can also revoke access in the provider's account-security page.
- Provider application configuration is a Super Admin/Render responsibility; a customer cannot supply a client secret or authorize a different user.

## Still required before real connections

Configure the provider application credentials in Render, register the callback URLs above, and apply migrations 0011 and 0012 after separate database approval. Then verify a real OAuth round-trip for every provider. A provider marked configured only means its client credentials exist; only a completed, successful user authorization creates a connected account.