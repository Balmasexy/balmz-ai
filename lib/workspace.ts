import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export type WorkspaceAIConfig = {
  apiKey: string | null;
  model: string;
  maxOutputTokens: number;
  dailyMessageLimit: number;
  enabled: boolean;
};

export async function getWorkspaceUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getWorkspaceAIConfig(): WorkspaceAIConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-astra";
  const enabled = Boolean(apiKey) && process.env.BALMZ_AI_CHAT_ENABLED !== "false";

  return {
    apiKey,
    model,
    maxOutputTokens: positiveInteger(process.env.BALMZ_AI_MAX_OUTPUT_TOKENS, 1200, 4000),
    dailyMessageLimit: positiveInteger(process.env.BALMZ_AI_DAILY_MESSAGE_LIMIT, 25, 250),
    enabled,
  };
}
