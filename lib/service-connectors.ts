import {
  AI_PROVIDERS,
  decryptProviderKey,
  encryptProviderKey,
} from "@/lib/ai/providers";

export type ServiceEnvironment = "demo" | "live";
export type ServiceId =
  | "paystack"
  | "coingecko"
  | "github"
  | "render"
  | "neon"
  | "agentic-ai"
  | "notes-ai"
  | "custom";

export type ServiceCredentials = Record<string, string>;

export const SERVICE_CATALOG: Array<{
  id: ServiceId;
  name: string;
  category: string;
  description: string;
  keyRequired: boolean;
  demoLive: boolean;
  url: string;
  keyHelp: string;
  envAliases: Partial<Record<ServiceEnvironment, string[]>>;
  capabilities: string[];
}> = [
  {
    id: "paystack",
    name: "Paystack",
    category: "Payments",
    description: "Verify test/live API credentials and prepare payment integration. Live processing stays disabled until the merchant account is approved and live mode is explicitly enabled.",
    keyRequired: true,
    demoLive: true,
    url: "https://dashboard.paystack.com/#/settings/developer",
    keyHelp: "Use sk_test_… for Demo and sk_live_… for Live. Paystack issues these keys in its dashboard.",
    envAliases: { demo: ["PAYSTACK_TEST_SECRET_KEY", "PAYSTACK_SECRET_KEY"], live: ["PAYSTACK_LIVE_SECRET_KEY"] },
    capabilities: ["Verify API key", "Read-only connection test", "Test/live separation"],
  },
  {
    id: "coingecko",
    name: "CoinGecko",
    category: "Market data",
    description: "Connect Demo API or Pro API keys for live cryptocurrency market-data requests.",
    keyRequired: true,
    demoLive: true,
    url: "https://www.coingecko.com/en/developers/dashboard",
    keyHelp: "Create Demo or Pro keys in the CoinGecko Developer Dashboard. Demo and Pro use different API hostnames.",
    envAliases: { demo: ["COINGECKO_DEMO_API_KEY", "COINGECKO_API_KEY"], live: ["COINGECKO_PRO_API_KEY"] },
    capabilities: ["Ping API", "Price/market data", "Demo/Pro endpoint separation"],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Developer tools",
    description: "Connect a fine-grained personal access token to list accessible repositories and inspect the connected account.",
    keyRequired: true,
    demoLive: false,
    url: "https://github.com/settings/personal-access-tokens",
    keyHelp: "Create a fine-grained personal access token. Start with read-only Metadata and Contents permissions; grant Actions read/write only when you intend to manage workflows.",
    envAliases: { live: ["GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"] },
    capabilities: ["Verify identity", "List accessible repositories", "Repository integration"],
  },
  {
    id: "render",
    name: "Render",
    category: "Hosting",
    description: "Use the existing Render API key for service, deployment, event, and metrics controls.",
    keyRequired: true,
    demoLive: false,
    url: "https://dashboard.render.com/account/api-keys",
    keyHelp: "Use a workspace-scoped Render API key with the minimum permissions required.",
    envAliases: { live: ["RENDER_API_KEY"] },
    capabilities: ["List services", "Inspect deploys/logs/metrics", "Trigger deploys"],
  },
  {
    id: "neon",
    name: "Neon",
    category: "Database",
    description: "Connect a Neon API key for project, branch, and database administration.",
    keyRequired: true,
    demoLive: false,
    url: "https://console.neon.tech/app/settings/api-keys",
    keyHelp: "Create a Neon API key in account settings. Keep the project database URL separate from this management token.",
    envAliases: { live: ["NEON_API_KEY"] },
    capabilities: ["Verify API key", "List projects", "Project operations"],
  },
  {
    id: "agentic-ai",
    name: "Agentic.ai Directory",
    category: "Agent discovery",
    description: "Search an open REST and MCP directory of agent tools. Its published directory API is read-only and does not require an API key.",
    keyRequired: false,
    demoLive: false,
    url: "https://agentic.ai/developers",
    keyHelp: "No API key required. Directory access is rate-limited by the provider.",
    envAliases: {},
    capabilities: ["Search agent tools", "Read listing details", "MCP directory"],
  },
  {
    id: "notes-ai",
    name: "Notes AI / custom notes provider",
    category: "Knowledge tools",
    description: "A generic OpenAI-compatible connector slot for your Note AI vendor endpoint. The vendor's exact API contract must be confirmed before connecting.",
    keyRequired: true,
    demoLive: false,
    url: "",
    keyHelp: "Enter the vendor-provided HTTPS API base URL, model ID, and API key.",
    envAliases: { live: ["NOTES_AI_API_KEY"] },
    capabilities: ["OpenAI-compatible text API", "Vendor endpoint validation"],
  },
  {
    id: "custom",
    name: "Custom API / Agent",
    category: "Custom",
    description: "Connect another HTTPS service that exposes an OpenAI-compatible chat completions API.",
    keyRequired: true,
    demoLive: true,
    url: "",
    keyHelp: "Enter an HTTPS base URL ending in /v1 or /v1/chat/completions, a model ID, and an API key.",
    envAliases: {},
    capabilities: ["Custom OpenAI-compatible endpoint", "Agent-compatible text chat"],
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeCode(status: number) {
  if (status === 401 || status === 403) return "CREDENTIAL_REJECTED";
  if (status === 404) return "ENDPOINT_NOT_FOUND";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "REQUEST_REJECTED";
}

function isPublicHttpsEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("INVALID_HTTPS_ENDPOINT");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) throw new Error("PRIVATE_ENDPOINT_NOT_ALLOWED");
  return url;
}

async function checkedFetch(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(safeCode(response.status));
  return response;
}

async function testGitHub(credentials: ServiceCredentials) {
  const token = credentials.token?.trim();
  if (!token) throw new Error("GITHUB_TOKEN_REQUIRED");
  const response = await checkedFetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const user = await response.json() as { login?: string; id?: number; avatar_url?: string };
  if (!user.login) throw new Error("GITHUB_INVALID_RESPONSE");
  return { account: user.login, accountId: user.id ?? null, avatarUrl: user.avatar_url ?? null };
}

async function testCoinGecko(credentials: ServiceCredentials, environment: ServiceEnvironment) {
  const key = credentials.apiKey?.trim();
  if (!key) throw new Error("COINGECKO_API_KEY_REQUIRED");
  const isPro = environment === "live";
  const endpoint = isPro ? "https://pro-api.coingecko.com/api/v3/ping" : "https://api.coingecko.com/api/v3/ping";
  const header = isPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
  await checkedFetch(endpoint, { headers: { [header]: key, Accept: "application/json" } });
  return { endpoint: isPro ? "CoinGecko Pro" : "CoinGecko Demo" };
}

async function testPaystack(credentials: ServiceCredentials, environment: ServiceEnvironment) {
  const secretKey = credentials.secretKey?.trim();
  if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY_REQUIRED");
  const prefix = environment === "demo" ? "sk_test_" : "sk_live_";
  if (!secretKey.startsWith(prefix)) throw new Error(environment === "demo" ? "PAYSTACK_DEMO_KEY_REQUIRED" : "PAYSTACK_LIVE_KEY_REQUIRED");
  await checkedFetch("https://api.paystack.co/bank?country=nigeria", {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  return { endpoint: environment === "demo" ? "Paystack Test" : "Paystack Live", keyPrefix: prefix };
}

async function testRender(credentials: ServiceCredentials) {
  const token = credentials.token?.trim();
  if (!token) throw new Error("RENDER_API_KEY_REQUIRED");
  await checkedFetch("https://api.render.com/v1/services?limit=1", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return { account: "Render API" };
}

async function testNeon(credentials: ServiceCredentials) {
  const token = credentials.token?.trim();
  if (!token) throw new Error("NEON_API_KEY_REQUIRED");
  await checkedFetch("https://console.neon.tech/api/v2/projects?limit=1", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return { account: "Neon API" };
}

async function testAgenticDirectory() {
  const response = await checkedFetch("https://agentic.ai/api/v1/search?q=coding+agent", {
    headers: { Accept: "application/json" },
  });
  await response.json();
  return { endpoint: "Agentic.ai Directory", authentication: "not_required" };
}

async function testOpenAICompatible(credentials: ServiceCredentials) {
  const base = credentials.baseUrl?.trim();
  const token = credentials.apiKey?.trim();
  const model = credentials.modelId?.trim();
  if (!base || !token || !model) throw new Error("CUSTOM_ENDPOINT_FIELDS_REQUIRED");
  const url = isPublicHttpsEndpoint(base);
  const endpoint = url.pathname.endsWith("/chat/completions")
    ? url.toString()
    : `${url.toString().replace(/\/$/, "")}/chat/completions`;
  const response = await checkedFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      max_tokens: 8,
    }),
  });
  await response.json();
  return { endpoint: url.origin, model };
}

export async function testServiceConnection(
  serviceId: ServiceId,
  credentials: ServiceCredentials,
  environment: ServiceEnvironment,
) {
  switch (serviceId) {
    case "github": return testGitHub(credentials);
    case "coingecko": return testCoinGecko(credentials, environment);
    case "paystack": return testPaystack(credentials, environment);
    case "render": return testRender(credentials);
    case "neon": return testNeon(credentials);
    case "agentic-ai": return testAgenticDirectory();
    case "notes-ai":
    case "custom": return testOpenAICompatible(credentials);
  }
}

export function serviceCredentialsFromEnvironment(
  serviceId: ServiceId,
  environment: ServiceEnvironment,
): ServiceCredentials | null {
  const service = SERVICE_CATALOG.find((entry) => entry.id === serviceId);
  if (!service) return null;
  const aliases = service.envAliases[environment] ?? [];
  for (const name of aliases) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    if (serviceId === "paystack") return { secretKey: value };
    if (serviceId === "coingecko") return { apiKey: value };
    return { token: value };
  }
  return null;
}

export function encryptServiceCredentials(credentials: ServiceCredentials): string {
  return encryptProviderKey(JSON.stringify(credentials));
}

export function decryptServiceCredentials(encrypted: string): ServiceCredentials {
  const parsed = JSON.parse(decryptProviderKey(encrypted)) as unknown;
  if (!isObject(parsed)) throw new Error("STORED_CREDENTIAL_INVALID");
  const result: ServiceCredentials = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

export async function checkStoredServiceCredential(encrypted: string, serviceId: ServiceId, environment: ServiceEnvironment) {
  return testServiceConnection(serviceId, decryptServiceCredentials(encrypted), environment);
}

export function getServiceSecretStatus(serviceId: ServiceId, environment: ServiceEnvironment) {
  const service = SERVICE_CATALOG.find((entry) => entry.id === serviceId);
  if (!service) return { configured: false, source: null };
  const aliases = service.envAliases[environment] ?? [];
  for (const name of aliases) {
    if (process.env[name]?.trim()) return { configured: true, source: "Render environment" };
  }
  return { configured: false, source: null };
}

export function publicServiceCatalog() {
  return SERVICE_CATALOG.map(({ id, name, category, description, keyRequired, demoLive, url, keyHelp, capabilities }) => ({
    id, name, category, description, keyRequired, demoLive, url, keyHelp, capabilities,
  }));
}
