import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getWorkspaceAIConfig, getWorkspaceUserId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getWorkspaceUserId();
    if (!userId) {
      return NextResponse.json({ enabled: false, model: null, message: "Please sign in to use your workspace." }, { status: 401 });
    }

    let storageReady = false;
    try {
      await getDbPool().query("SELECT 1 FROM public.balmz_conversations LIMIT 0");
      await getDbPool().query("SELECT 1 FROM public.balmz_messages LIMIT 0");
      storageReady = true;
    } catch {
      storageReady = false;
    }

    const config = getWorkspaceAIConfig();
    if (!storageReady) {
      return NextResponse.json({
        enabled: false,
        model: null,
        message: "Saved conversations are waiting for the BALMZ AI workspace database setup.",
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!config.enabled) {
      return NextResponse.json({
        enabled: false,
        model: config.model,
        message: "AI chat is waiting for its server-side OpenAI configuration. Add the provider key in Render to enable responses.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      enabled: true,
      model: config.model,
      message: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      enabled: false,
      model: null,
      message: "BALMZ AI could not verify this workspace. Refresh the page and sign in again.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
