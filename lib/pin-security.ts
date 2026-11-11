import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

function scryptValue(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey as Buffer);
      },
    );
  });
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  if (pin === "123456" || pin === "654321" || pin === "000000" || pin === "112233") return false;
  return true;
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error("PIN must be six digits and not an obvious sequence.");
  const salt = randomBytes(16);
  const derived = await scryptValue(pin, salt);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) return false;
  const [algorithm, saltHex, keyHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;

  try {
    const expected = Buffer.from(keyHex, "hex");
    const actual = await scryptValue(pin, Buffer.from(saltHex, "hex"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Authentication secret is unavailable.");
  }
  return secret;
}

export function digestRecoveryValue(
  purpose: "email-code" | "reset-token",
  userId: string,
  value: string,
): string {
  return createHmac("sha256", authSecret())
    .update(`${purpose}:${userId}:${value}`)
    .digest("hex");
}

export function safeDigestEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    actualBuffer.length > 0 &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createEmailCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function createRecoveryToken(): string {
  return randomBytes(32).toString("base64url");
}
