const renderBaseUrl = process.env.RENDER_EXTERNAL_URL;
const vercelBaseUrl =
  process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;

// Prefer the host that is actually running this process. A stale
// NEXT_PUBLIC_APP_URL must not send Render navigation to a Vercel domain.
const configuredBaseUrl =
  renderBaseUrl || vercelBaseUrl || process.env.NEXT_PUBLIC_APP_URL;

function normalizeBaseUrl(value: string): string {
  const withProtocol = value.startsWith("http") ? value : `https://${value}`;
  return withProtocol.replace(/\\/$/, "");
}

export const baseURL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : normalizeBaseUrl(configuredBaseUrl || "https://balmz-ai.onrender.com");
