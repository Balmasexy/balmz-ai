import { createHash, createHmac, randomUUID } from "node:crypto";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string): string {
  return value.split("/").map(awsEncode).join("/");
}

function canonicalQuery(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function signingKey(secret: string, date: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function endpoint(settings: R2Config) {
  const host = `${settings.accountId}.r2.cloudflarestorage.com`;
  return { host, origin: `https://${host}` };
}

function objectPath(key: string): string {
  return `/${encodePath(key)}`;
}

export function isR2Configured(): boolean {
  return config() !== null;
}

export function createR2ObjectKey(filename: string): string {
  const safe = filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "upload";
  return `admin/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safe}`;
}

export function createR2PresignedUrl(method: "GET" | "PUT", key: string, contentType?: string) {
  const settings = config();
  if (!settings) throw new Error("R2_NOT_CONFIGURED");
  const { host, origin } = endpoint(settings);
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const scope = `${date}/auto/s3/aws4_request`;
  const signedHeaders = contentType && method === "PUT" ? "content-type;host" : "host";
  const query = canonicalQuery({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${settings.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "900",
    "X-Amz-SignedHeaders": signedHeaders,
  });
  const headers = contentType && method === "PUT"
    ? `content-type:${contentType.trim()}\nhost:${host}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    method,
    objectPath(key),
    query,
    headers,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(settings.secretAccessKey, date), stringToSign).toString("hex");
  return {
    url: `${origin}${objectPath(settings.bucket, key)}?${query}&X-Amz-Signature=${signature}`,
    headers: contentType && method === "PUT" ? { "Content-Type": contentType } : {},
    expiresInSeconds: 900,
  };
}

async function signedR2Request(method: "GET" | "DELETE", key: string, query: Record<string, string> = {}) {
  const settings = config();
  if (!settings) throw new Error("R2_NOT_CONFIGURED");
  const { host, origin } = endpoint(settings);
  const date = new Date();
  const shortDate = date.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const scope = `${shortDate}/auto/s3/aws4_request`;
  const payloadHash = sha256("");
  const canonicalUri = objectPath(settings.bucket, key);
  const canonicalQueryString = canonicalQuery(query);
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(settings.secretAccessKey, shortDate), stringToSign).toString("hex");
  const response = await fetch(`${origin}${canonicalUri}${canonicalQueryString ? `?${canonicalQueryString}` : ""}`, {
    method,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return response;
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]) : "";
}

export type StoredObject = { key: string; size: number; lastModified: string | null };

export async function listR2AdminObjects(): Promise<{ objects: StoredObject[]; listedBytes: number; truncated: boolean }> {
  const response = await signedR2Request("GET", "", {
    "list-type": "2",
    "max-keys": "1000",
    prefix: "admin/",
  });
  if (!response.ok) throw new Error(`R2_LIST_FAILED_${response.status}`);
  const xml = await response.text();
  const objects: StoredObject[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = match[1];
    const key = tag(block, "Key");
    if (!key.startsWith("admin/")) continue;
    objects.push({
      key,
      size: Number(tag(block, "Size")) || 0,
      lastModified: tag(block, "LastModified") || null,
    });
  }
  return {
    objects,
    listedBytes: objects.reduce((total, item) => total + item.size, 0),
    truncated: tag(xml, "IsTruncated").toLowerCase() === "true",
  };
}

export async function deleteR2AdminObject(key: string): Promise<void> {
  if (!key.startsWith("admin/") || key.includes(String.fromCharCode(0))) throw new Error("INVALID_OBJECT_KEY");
  const response = await signedR2Request("DELETE", key);
  if (!response.ok) throw new Error(`R2_DELETE_FAILED_${response.status}`);
}
