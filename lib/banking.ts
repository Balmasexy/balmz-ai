import { randomBytes } from "node:crypto";
import { getDbPool } from "@/lib/db";
import { decryptProviderKey } from "@/lib/ai/providers";

export type BankingEnvironment = "demo" | "live";
export type PlaidCredentials = { clientId: string; secret: string };
export type MoneyMovementCredentials = { key: string; secret: string };

function environmentValue(value: string | undefined): BankingEnvironment {
  return value?.trim().toLowerCase() === "production" || value?.trim().toLowerCase() === "live" ? "live" : "demo";
}

export function getPlaidEnvironment(): BankingEnvironment { return environmentValue(process.env.PLAID_ENV); }
export function getMoneyMovementEnvironment(): BankingEnvironment { return environmentValue(process.env.NMI_MONEY_MOVEMENT_ENV); }
export function plaidBaseUrl(environment: BankingEnvironment) { return environment === "demo" ? "https://sandbox.plaid.com" : "https://production.plaid.com"; }
export function moneyMovementBaseUrl(environment: BankingEnvironment) { return environment === "demo" ? "https://api-sandbox.dwolla.com" : "https://api.dwolla.com"; }

async function savedCredentials(provider: "plaid" | "money-movement", environment: BankingEnvironment): Promise<Record<string, string> | null> {
  const result = await getDbPool().query<{ encrypted_credentials: string }>(
    "SELECT encrypted_credentials FROM public.balmz_service_credentials WHERE service_id = $1 AND environment = $2 AND status = 'connected' ORDER BY updated_at DESC LIMIT 1",
    [provider, environment],
  );
  const row = result.rows[0];
  if (!row?.encrypted_credentials) return null;
  const value = JSON.parse(decryptProviderKey(row.encrypted_credentials)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("BANK_CREDENTIAL_INVALID");
  const credentials: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (typeof item === "string") credentials[key] = item;
  return credentials;
}

export async function getPlaidCredentials(environment: BankingEnvironment = getPlaidEnvironment()): Promise<PlaidCredentials> {
  const saved = await savedCredentials("plaid", environment);
  const clientId = saved?.clientId || process.env.PLAID_CLIENT_ID?.trim();
  const secret = saved?.secret || (environment === "demo" ? process.env.PLAID_SANDBOX_SECRET?.trim() : process.env.PLAID_PRODUCTION_SECRET?.trim());
  if (!clientId || !secret) throw new Error("PLAID_NOT_CONFIGURED");
  return { clientId, secret };
}

export async function getMoneyMovementCredentials(environment: BankingEnvironment = getMoneyMovementEnvironment()): Promise<MoneyMovementCredentials> {
  const saved = await savedCredentials("money-movement", environment);
  const key = saved?.key || (environment === "demo" ? process.env.NMI_MONEY_MOVEMENT_SANDBOX_KEY?.trim() : process.env.NMI_MONEY_MOVEMENT_PRODUCTION_KEY?.trim());
  const secret = saved?.secret || (environment === "demo" ? process.env.NMI_MONEY_MOVEMENT_SANDBOX_SECRET?.trim() : process.env.NMI_MONEY_MOVEMENT_PRODUCTION_SECRET?.trim());
  if (!key || !secret) throw new Error("MONEY_MOVEMENT_NOT_CONFIGURED");
  return { key, secret };
}

export async function plaidRequest<T>(environment: BankingEnvironment, credentials: PlaidCredentials, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(plaidBaseUrl(environment) + endpoint, {
    method: "POST",
    headers: {
      "PLAID-CLIENT-ID": credentials.clientId,
      "PLAID-SECRET": credentials.secret,
      "Plaid-Version": "2020-09-14",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.error_code === "string" ? payload.error_code : "REQUEST_FAILED";
    throw new Error("PLAID_" + code);
  }
  return payload as T;
}

export async function getMoneyMovementAccessToken(environment: BankingEnvironment, credentials?: MoneyMovementCredentials): Promise<string> {
  const auth = credentials ?? await getMoneyMovementCredentials(environment);
  const response = await fetch(moneyMovementBaseUrl(environment) + "/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(auth.key + ":" + auth.secret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/vnd.dwolla.v1.hal+json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(response.status === 401 || response.status === 403 ? "MONEY_MOVEMENT_CREDENTIAL_REJECTED" : "MONEY_MOVEMENT_AUTHENTICATION_FAILED");
  }
  return payload.access_token;
}

export async function moneyMovementRequest<T>(
  environment: BankingEnvironment,
  accessToken: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; location: string | null }> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("MONEY_MOVEMENT_INVALID_RESOURCE");
  const response = await fetch(moneyMovementBaseUrl(environment) + path, {
    method,
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/vnd.dwolla.v1.hal+json",
      ...(body ? { "Content-Type": "application/vnd.dwolla.v1.hal+json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const location = response.headers.get("location");
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try { data = JSON.parse(text) as T; } catch { throw new Error("MONEY_MOVEMENT_INVALID_RESPONSE"); }
  }
  if (!response.ok) {
    const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const code = typeof payload.code === "string" ? payload.code : "REQUEST_FAILED";
    if (response.status === 401 || response.status === 403) throw new Error("MONEY_MOVEMENT_CREDENTIAL_REJECTED");
    throw new Error("MONEY_MOVEMENT_" + code);
  }
  return { data, location };
}

export async function testPlaidCredentials(environment: BankingEnvironment, credentials: PlaidCredentials) {
  const result = await plaidRequest<{ institutions?: unknown[] }>(environment, credentials, "/institutions/get", { country_codes: ["US"], count: 1, offset: 0 });
  if (!Array.isArray(result.institutions)) throw new Error("PLAID_INVALID_RESPONSE");
  return { connected: true, environment: environment === "demo" ? "Sandbox" : "Production" };
}

export async function testMoneyMovementCredentials(environment: BankingEnvironment, credentials: MoneyMovementCredentials) {
  await getMoneyMovementAccessToken(environment, credentials);
  return { connected: true, environment: environment === "demo" ? "Sandbox" : "Production" };
}

export function safeBankingError(error: unknown) {
  const code = error instanceof Error ? error.message : "BANKING_SERVICE_UNAVAILABLE";
  if (code === "PLAID_NOT_CONFIGURED") return { code, message: "Plaid credentials are not configured in the Admin Secret Vault." };
  if (code === "MONEY_MOVEMENT_NOT_CONFIGURED") return { code, message: "NMI Money Movement sandbox credentials are not configured in the Admin Secret Vault." };
  if (code.includes("CREDENTIAL_REJECTED")) return { code, message: "The provider rejected these credentials. Confirm that the key and secret belong to the selected environment." };
  if (code.startsWith("PLAID_")) return { code, message: "Plaid could not complete this request. Check the Plaid connection and try again." };
  if (code.startsWith("MONEY_MOVEMENT_")) return { code, message: "NMI Money Movement could not complete this request. Check the provider account and try again." };
  if (code === "42P01") return { code: "BANKING_SCHEMA_REQUIRED", message: "Apply the BALMZ AI banking database migration before using bank connections." };
  return { code: "BANKING_SERVICE_UNAVAILABLE", message: "The bank connection service is temporarily unavailable." };
}

export function createBankingId() { return randomBytes(16).toString("hex"); }
