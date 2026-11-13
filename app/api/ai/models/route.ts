import { headers } from "next/headers";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listAIProviderConnections, AI_PROVIDERS } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const models: Array<{ value: string; label: string; provider: string; modelId: string }> = [];
  let connectionsAvailable = true;
  try {
    const connections = await listAIProviderConnections();
    for (const connection of connections.filter((item) => item.last_test_status === "connected")) {
      models.push({
        value: `connection:${connection.id}`,
        label: `${connection.display_name} · ${connection.model_id}`,
        provider: AI_PROVIDERS[connection.provider_id].label,
        modelId: connection.model_id,
      });
    }
  } catch {
    // Keep the legacy environment key available while the additive migration is being applied.
    connectionsAvailable = false;
  }

  if (process.env.OPENAI_API_KEY) {
    if (!models.some((item) => item.provider === "OpenAI")) {
      models.push(
        { value: "env:gpt-4.1-mini", label: "GPT-4.1 mini · server key", provider: "OpenAI", modelId: "gpt-4.1-mini" },
        { value: "env:gpt-4.1", label: "GPT-4.1 · server key", provider: "OpenAI", modelId: "gpt-4.1" },
      );
    }
  }

  return NextResponse.json({
    models,
    connectionsAvailable,
    message: models.length ? null : "No AI provider has been connected by the Super Admin yet.",
  }, { headers: { "Cache-Control": "no-store" } });
}
