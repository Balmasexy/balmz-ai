import { Pool } from "pg";

type GlobalWithPool = typeof globalThis & {
  __balmzPostgresPool?: Pool;
};

const globalWithPool = globalThis as GlobalWithPool;

/**
 * Server-only Neon connection. DATABASE_URL is deliberately read at runtime,
 * never serialized to client code or written into the repository.
 */
export function getDbPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for BALMZ AI.");
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  if (process.env.NODE_ENV === "production") {
    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode !== "require" && sslMode !== "verify-full") {
      throw new Error("Production DATABASE_URL must require TLS (sslmode=require or verify-full).");
    }
  }

  if (!globalWithPool.__balmzPostgresPool) {
    const pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
      application_name: "balmz-ai",
    });

    pool.on("error", (error: Error) => {
      // Never log connection strings, query parameters, or credentials.
      console.error("BALMZ AI PostgreSQL pool error:", error.message);
    });

    globalWithPool.__balmzPostgresPool = pool;
  }

  return globalWithPool.__balmzPostgresPool;
}
