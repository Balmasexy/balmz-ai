/**
 * @typedef {Object} OAuthProvider
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} authorizationUrl
 * @property {string} tokenUrl
 * @property {string} userInfoUrl
 * @property {string} clientIdEnv
 * @property {string} clientSecretEnv
 * @property {string[]} scopes
 * @property {boolean} usePkce
 * @property {boolean} [scopeParam]
 * @property {'body'|'basic'} tokenAuth
 * @property {'json'|'form'} [tokenFormat]
 * @property {'GET'|'POST'} [userInfoMethod]
 * @property {Record<string,string>} authorizationParams
 */
/** @type {Record<string, OAuthProvider>} */
const PROVIDERS = {
  google: {
    id: "google",
    label: "Google Workspace",
    description: "Gmail, Drive and Calendar read-only access",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    scopes: [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    id: "microsoft",
    label: "Microsoft 365",
    description: "Outlook, OneDrive and Calendar read-only access",
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Files.Read.All", "Calendars.Read"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: { prompt: "select_account" },
  },
  slack: {
    id: "slack",
    label: "Slack",
    description: "User-authorized channels and message history, read-only",
    authorizationUrl: "https://slack.com/oauth/v2_user/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.user.access",
    userInfoUrl: "https://slack.com/api/auth.test",
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
    scopes: ["channels:read", "channels:history", "search:read"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: {},
  },
  dropbox: {
    id: "dropbox",
    label: "Dropbox",
    description: "File metadata and content read access",
    authorizationUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropbox.com/oauth2/token",
    userInfoUrl: "https://api.dropboxapi.com/2/users/get_current_account",
    userInfoMethod: "POST",
    clientIdEnv: "DROPBOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "DROPBOX_OAUTH_CLIENT_SECRET",
    scopes: ["account_info.read", "files.metadata.read", "files.content.read"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: { token_access_type: "offline", response_type: "code" },
  },
  box: {
    id: "box",
    label: "Box",
    description: "Box files and folders with read-only access",
    authorizationUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    userInfoUrl: "https://api.box.com/2.0/users/me",
    clientIdEnv: "BOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "BOX_OAUTH_CLIENT_SECRET",
    scopes: ["root_readonly"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: {},
  },
  github: {
    id: "github",
    label: "GitHub account",
    description: "GitHub identity only; repository access requires a separately approved GitHub App installation",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    scopes: ["read:user", "user:email"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: { allow_signup: "true" },
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    description: "Read-only profile and repository access",
    authorizationUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    userInfoUrl: "https://gitlab.com/api/v4/user",
    clientIdEnv: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITLAB_OAUTH_CLIENT_SECRET",
    scopes: ["read_user", "read_api", "read_repository"],
    usePkce: true,
    tokenAuth: "body",
    authorizationParams: {},
  },
  notion: {
    id: "notion",
    label: "Notion",
    description: "Workspace pages and databases allowed by the Notion integration",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    userInfoUrl: "https://api.notion.com/v1/users/me",
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    scopes: ["read-content (enable read content in the Notion integration settings)"],
    scopeParam: false,
    usePkce: false,
    tokenAuth: "basic",
    tokenFormat: "json",
    authorizationParams: { owner: "user" },
  },
};

export function getCustomerOAuthProvider(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(PROVIDERS, id)
    ? PROVIDERS[id]
    : null;
}

export function getCustomerOAuthProviderStatus(env = process.env, baseUrl = env.BETTER_AUTH_URL || env.APP_BASE_URL || "https://balmz-ai.onrender.com") {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    scopes: provider.scopes,
    configured: Boolean(env[provider.clientIdEnv]?.trim() && env[provider.clientSecretEnv]?.trim()),
    redirectUri: buildCustomerOAuthCallbackUrl(provider.id, baseUrl),
  }));
}

export function buildCustomerOAuthCallbackUrl(providerId, baseUrl) {
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) throw new Error("OAUTH_PROVIDER_UNSUPPORTED");
  let base;
  try { base = new URL(baseUrl); } catch { throw new Error("OAUTH_BASE_URL_INVALID"); }
  if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("OAUTH_BASE_URL_INVALID");
  if (base.username || base.password || base.search || base.hash) throw new Error("OAUTH_BASE_URL_INVALID");
  return new URL("/api/integrations/" + provider.id + "/callback", base.origin).toString();
}

export function buildCustomerOAuthAuthorizationUrl(providerId, input) {
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) throw new Error("OAUTH_PROVIDER_UNSUPPORTED");
  if (!input?.state || !input?.clientId || !input?.baseUrl) throw new Error("OAUTH_CONFIGURATION_INVALID");
  const url = new URL(provider.authorizationUrl);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", buildCustomerOAuthCallbackUrl(providerId, input.baseUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  if (provider.scopeParam !== false) url.searchParams.set("scope", provider.scopes.join(" "));
  for (const [key, value] of Object.entries(provider.authorizationParams ?? {})) {
    url.searchParams.set(key, value);
  }
  if (provider.usePkce) {
    if (!input.codeChallenge) throw new Error("OAUTH_PKCE_REQUIRED");
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export const CUSTOMER_OAUTH_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));
