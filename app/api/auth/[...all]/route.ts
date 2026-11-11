import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const handlers = toNextJsHandler(getAuth());
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  const handlers = toNextJsHandler(getAuth());
  return handlers.POST(request);
}
