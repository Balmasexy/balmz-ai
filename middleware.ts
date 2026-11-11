import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { baseURL } from "./baseUrl";

const allowedOrigins = new Set<string>([
  new URL(baseURL).origin,
  "https://chatgpt.com",
  "https://chat.openai.com",
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    }),
]);

const allowedMethods = "GET, POST, OPTIONS";
const allowedHeaders =
  "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID, OpenAI-Conversation-Id, OpenAI-Session-Id";

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Requests without an Origin are commonly server-to-server and same-origin.
  if (!origin) {
    return NextResponse.next();
  }

  if (!allowedOrigins.has(origin)) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 403 });
    }
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", allowedMethods);
    response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Max-Age", "600");
    response.headers.append("Vary", "Origin");
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", allowedMethods);
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Expose-Headers",
    "MCP-Session-Id, MCP-Protocol-Version",
  );
  response.headers.append("Vary", "Origin");
  return response;
}

export const config = {
  matcher: "/:path*",
};
