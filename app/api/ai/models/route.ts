import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getWorldWalletGeminiBackendModel, resolveWorldWalletAIExternalAuth } from "@/lib/integrations/world-wallet-ai-auth";
import { listAIProviderConnections, AI_PROVIDERS, getGeneralLanguageEnvironmentConfig } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const externalAuth = await resolveWorldWalletAIExternalAuth(request);
  if (externalAuth.error) {
    return NextResponse.json(
      { error: externalAuth.error.code, message: externalAuth.error.message },
      { status: externalAuth.error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const session = externalAuth.isExternal ? null : await getAuth().api.getSession({ headers: await headers() });
  const userId = externalAuth.userId || session?.user.id;
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });

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

  const hasConnectedOpenAI = models.some((item) => item.provider === AI_PROVIDERS.openai.label);
  if (process.env.OPENAI_API_KEY && !hasConnectedOpenAI) {
    models.push(
      { value: "env:gpt-4.1-mini", label: "GPT-4.1 mini · OpenAI server key", provider: AI_PROVIDERS.openai.label, modelId: "gpt-4.1-mini" },
      { value: "env:gpt-4.1", label: "GPT-4.1 · OpenAI server key", provider: AI_PROVIDERS.openai.label, modelId: "gpt-4.1" },
    );
  }

  const general = getGeneralLanguageEnvironmentConfig();
  const hasConnectedGeneral = models.some((item) => item.provider === AI_PROVIDERS.general.label);
  if (general.apiKey && general.baseUrl && general.modelId && !hasConnectedGeneral) {
    models.push({
      value: "env:general",
      label: `${general.modelId} · General Language server key`,
      provider: AI_PROVIDERS.general.label,
      modelId: general.modelId,
    });
  }

  const backendGemini = await getWorldWalletGeminiBackendModel(userId);
  if (backendGemini && !models.some((item) => item.value === "env:world-wallet-gemini")) {
    models.unshift({
      value: "env:world-wallet-gemini",
      label: backendGemini.model + " · Google Gemini (World Wallet backend)",
      provider: AI_PROVIDERS.google.label,
      modelId: backendGemini.model,
    });
  }

  return NextResponse.json({
    models,
    connectionsAvailable,
    message: models.length ? null : "No AI provider has been connected by the Super Admin yet.",
  }, { headers: { "Cache-Control": "no-store" } });
}
