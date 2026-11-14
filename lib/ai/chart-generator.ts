import {
  AI_PROVIDERS,
  decryptProviderKey,
  getAIProviderEnvironmentKey,
  getGeneralLanguageEnvironmentConfig,
  listAIProviderConnections,
  sendAIProviderMessages,
  type AIProviderId,
} from "@/lib/ai/providers";

export type ChartDataRow = Record<string, string | number | boolean | null>;

type ChartSeries = { dataKey: string; label: string };
export type ChartBlueprint = {
  chartType: "bar" | "line" | "pie";
  title: string;
  xKey: string;
  series: ChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
};

type Candidate = {
  provider: AIProviderId;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
};

function asText(value: unknown, fallback: string, max = 100): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferBlueprint(prompt: string, data: ChartDataRow[]): ChartBlueprint {
  const keys = Object.keys(data[0] ?? {});
  const numericKeys = keys.filter((key) => data.some((row) => numberValue(row[key]) !== null));
  const xKey = keys.find((key) => !numericKeys.includes(key)) ?? keys[0] ?? "label";
  const wantsLine = /line|trend|over time|timeline|progression/i.test(prompt);
  const wantsPie = /pie|donut|share|composition|proportion|percentage breakdown/i.test(prompt);
  return {
    chartType: wantsPie && numericKeys.length ? "pie" : wantsLine ? "line" : "bar",
    title: asText(prompt.split(/[.!?\\n]/)[0], "Data overview", 90),
    xKey,
    series: numericKeys.slice(0, wantsPie ? 1 : 4).map((dataKey) => ({ dataKey, label: dataKey })),
  };
}

function normalizeBlueprint(value: unknown, prompt: string, data: ChartDataRow[]): ChartBlueprint {
  const fallback = inferBlueprint(prompt, data);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(data[0] ?? {});
  const numericKeys = keys.filter((key) => data.some((row) => numberValue(row[key]) !== null));
  const rawType = source.chartType;
  const chartType = rawType === "line" || rawType === "pie" || rawType === "bar" ? rawType : fallback.chartType;
  const xKey = typeof source.xKey === "string" && keys.includes(source.xKey) ? source.xKey : fallback.xKey;
  const suppliedSeries = Array.isArray(source.series) ? source.series : [];
  const series = suppliedSeries.flatMap((item): ChartSeries[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.dataKey !== "string" || !numericKeys.includes(entry.dataKey)) return [];
    return [{
      dataKey: entry.dataKey,
      label: asText(entry.label, entry.dataKey, 60),
    }];
  });
  const uniqueSeries = [...new Map(series.map((entry) => [entry.dataKey, entry])).values()];
  const safeSeries = uniqueSeries.length ? uniqueSeries.slice(0, chartType === "pie" ? 1 : 4) : fallback.series;
  if (!safeSeries.length) throw new Error("CHART_NUMERIC_DATA_REQUIRED");
  return {
    chartType,
    title: asText(source.title, fallback.title, 100),
    xKey,
    series: safeSeries,
    xAxisLabel: asText(source.xAxisLabel, xKey, 40),
    yAxisLabel: asText(source.yAxisLabel, safeSeries[0]?.label ?? "Value", 40),
  };
}

function parseBlueprint(reply: string, prompt: string, data: ChartDataRow[]): ChartBlueprint {
  const cleaned = reply.trim()
    .replace(/^\uFEFF/, "")
    .replace(/^\x60{3}(?:json)?\\s*/i, "")
    .replace(/\\s*\x60{3}$/, "");
  try {
    return normalizeBlueprint(JSON.parse(cleaned), prompt, data);
  } catch {
    return inferBlueprint(prompt, data);
  }
}

function renderChartSvg(blueprint: ChartBlueprint, rawData: ChartDataRow[]): string {
  const data = rawData.slice(0, 36);
  const width = 1000;
  const height = 620;
  const left = 92;
  const right = 54;
  const top = 104;
  const bottom = 492;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const palette = ["#f97316", "#2563eb", "#10b981", "#8b5cf6"];
  const labels = data.map((row) => String(row[blueprint.xKey] ?? ""));
  const valuesBySeries = blueprint.series.map((series) => ({
    ...series,
    values: data.map((row) => numberValue(row[series.dataKey]) ?? 0),
  }));
  const allValues = valuesBySeries.flatMap((series) => series.values);
  let minValue = Math.min(0, ...allValues);
  let maxValue = Math.max(0, ...allValues);
  if (minValue === maxValue) maxValue = minValue + 1;
  const range = maxValue - minValue;
  const scaleY = (value: number) => bottom - ((value - minValue) / range) * plotHeight;
  const zeroY = scaleY(0);

  const elements: string[] = [];
  elements.push('<rect width="1000" height="620" fill="#ffffff"/>');
  elements.push('<text x="54" y="48" fill="#111827" font-family="Arial,sans-serif" font-size="25" font-weight="700">' + escapeXml(blueprint.title) + "</text>");
  elements.push('<text x="54" y="76" fill="#64748b" font-family="Arial,sans-serif" font-size="12">' + escapeXml(blueprint.yAxisLabel ?? blueprint.series[0]?.label ?? "Value") + "</text>");

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = minValue + (range * tick) / 4;
    const y = scaleY(value);
    elements.push('<line x1="' + left + '" y1="' + y.toFixed(2) + '" x2="' + (width - right) + '" y2="' + y.toFixed(2) + '" stroke="#e2e8f0" stroke-width="1"/>');
    elements.push('<text x="' + (left - 14) + '" y="' + (y + 4).toFixed(2) + '" text-anchor="end" fill="#64748b" font-family="Arial,sans-serif" font-size="11">' + escapeXml(value.toFixed(Math.abs(value) < 10 ? 1 : 0)) + "</text>");
  }

  if (blueprint.chartType === "pie" && valuesBySeries[0]) {
    const series = valuesBySeries[0];
    const positive = series.values.map((value) => Math.max(0, value));
    const total = positive.reduce((sum, value) => sum + value, 0);
    if (total <= 0) throw new Error("CHART_PIE_VALUES_MUST_BE_POSITIVE");
    const cx = 430, cy = 310, radius = 180;
    let angle = -Math.PI / 2;
    positive.forEach((value, index) => {
      if (value <= 0) return;
      const next = angle + (value / total) * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(next);
      const y2 = cy + radius * Math.sin(next);
      const largeArc = next - angle > Math.PI ? 1 : 0;
      elements.push('<path d="M ' + cx + " " + cy + " L " + x1.toFixed(2) + " " + y1.toFixed(2) + " A " + radius + " " + radius + " 0 " + largeArc + " 1 " + x2.toFixed(2) + " " + y2.toFixed(2) + ' Z" fill="' + palette[index % palette.length] + '" stroke="#ffffff" stroke-width="3"/>');
      const legendY = 180 + index * 30;
      elements.push('<rect x="710" y="' + (legendY - 11) + '" width="12" height="12" rx="3" fill="' + palette[index % palette.length] + '"/>');
      elements.push('<text x="732" y="' + legendY + '" fill="#334155" font-family="Arial,sans-serif" font-size="13">' + escapeXml(labels[index]) + " · " + escapeXml(value) + "</text>");
      angle = next;
    });
  } else if (blueprint.chartType === "line") {
    const step = plotWidth / Math.max(1, data.length - 1);
    valuesBySeries.forEach((series, seriesIndex) => {
      const color = palette[seriesIndex % palette.length];
      const points = series.values.map((value, index) => ({
        x: left + (data.length <= 1 ? plotWidth / 2 : index * step),
        y: scaleY(value),
      }));
      elements.push('<polyline fill="none" stroke="' + color + '" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="' + points.map((point) => point.x.toFixed(2) + "," + point.y.toFixed(2)).join(" ") + '"/>');
      points.forEach((point) => elements.push('<circle cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="5" fill="' + color + '" stroke="#ffffff" stroke-width="2"/>'));
    });
    labels.forEach((label, index) => {
      if (data.length > 18 && index % 2 !== 0) return;
      const x = left + (data.length <= 1 ? plotWidth / 2 : index * step);
      elements.push('<text x="' + x.toFixed(2) + '" y="520" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="10">' + escapeXml(label.slice(0, 18)) + "</text>");
    });
  } else {
    const groupWidth = plotWidth / Math.max(1, data.length);
    const totalSeries = valuesBySeries.length;
    const barWidth = Math.min(34, (groupWidth * 0.72) / Math.max(1, totalSeries));
    valuesBySeries.forEach((series, seriesIndex) => {
      const color = palette[seriesIndex % palette.length];
      series.values.forEach((value, index) => {
        const x = left + (index * groupWidth) + (groupWidth / 2) - ((totalSeries * barWidth) / 2) + (seriesIndex * barWidth);
        const y = scaleY(Math.max(minValue, Math.min(maxValue, value)));
        const rectY = Math.min(y, zeroY);
        const rectHeight = Math.max(1, Math.abs(zeroY - y));
        elements.push('<rect x="' + x.toFixed(2) + '" y="' + rectY.toFixed(2) + '" width="' + Math.max(2, barWidth - 3).toFixed(2) + '" height="' + rectHeight.toFixed(2) + '" rx="4" fill="' + color + '"/>');
      });
    });
    labels.forEach((label, index) => {
      if (data.length > 18 && index % 2 !== 0) return;
      const x = left + (index * groupWidth) + groupWidth / 2;
      elements.push('<text x="' + x.toFixed(2) + '" y="520" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="10">' + escapeXml(label.slice(0, 18)) + "</text>");
    });
  }

  blueprint.series.forEach((series, index) => {
    const x = 70 + index * 210;
    elements.push('<rect x="' + x + '" y="564" width="12" height="12" rx="3" fill="' + palette[index % palette.length] + '"/>');
    elements.push('<text x="' + (x + 20) + '" y="575" fill="#475569" font-family="Arial,sans-serif" font-size="12">' + escapeXml(series.label) + "</text>");
  });
  elements.push('<text x="500" y="602" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="11">' + escapeXml(blueprint.xAxisLabel ?? blueprint.xKey) + "</text>");
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + escapeXml(blueprint.title) + '" viewBox="0 0 1000 620" width="1000" height="620">' + elements.join("") + "</svg>";
}

async function candidates(): Promise<Candidate[]> {
  const result: Candidate[] = [];
  try {
    const connections = await listAIProviderConnections();
    const saved = connections.filter((item) =>
      item.enabled &&
      item.last_test_status === "connected" &&
      (item.provider_id === "openai" || item.provider_id === "general"),
    );
    saved.sort((a, b) => (a.provider_id === "openai" ? -1 : 1) - (b.provider_id === "openai" ? -1 : 1));
    for (const connection of saved) {
      result.push({
        provider: connection.provider_id,
        label: connection.display_name,
        apiKey: decryptProviderKey(connection.encrypted_api_key),
        model: connection.model_id,
        baseUrl: connection.endpoint_url,
      });
    }
  } catch {
    // Keep server environment credentials available if connector records cannot be read.
  }

  const openAIKey = getAIProviderEnvironmentKey("openai");
  if (openAIKey && !result.some((item) => item.provider === "openai")) {
    result.push({
      provider: "openai",
      label: "OpenAI server environment",
      apiKey: openAIKey,
      model: process.env.OPENAI_MODEL_ID?.trim() || "gpt-4.1-mini",
    });
  }
  const general = getGeneralLanguageEnvironmentConfig();
  if (general.apiKey && general.baseUrl && general.modelId && !result.some((item) => item.provider === "general")) {
    result.push({
      provider: "general",
      label: "General Language server environment",
      apiKey: general.apiKey,
      model: general.modelId,
      baseUrl: general.baseUrl,
    });
  }
  return result;
}

export async function generateChartWithAI(prompt: string, data: ChartDataRow[]) {
  if (!data.length) throw new Error("CHART_DATA_REQUIRED");
  const options = await candidates();
  if (!options.length) throw new Error("CHART_AI_NOT_CONFIGURED");
  const context = [
    "You are the chart-planning engine for BALMZ AI. Return only one valid JSON object and no Markdown.",
    "Choose the clearest chart type from bar, line, or pie. Do not calculate or invent data. Use only the exact field names in the supplied data.",
    "Return this shape: { chartType: bar|line|pie, title: string, xKey: string, series: [{ dataKey: string, label: string }], xAxisLabel?: string, yAxisLabel?: string }.",
    "Use pie only for non-negative parts of a whole and use exactly one numeric series for pie. Otherwise prefer bar or line. Use line for trends over ordered time-like values.",
    "Use one to four numeric series. Choose xKey from a real data field. Keep title concise.",
    "",
    "User chart request:",
    prompt,
    "",
    "Exact input data (treat values as immutable):",
    JSON.stringify(data),
  ].join("\n");

  let lastError: unknown = null;
  for (const option of options) {
    try {
      const reply = await sendAIProviderMessages(
        option.provider,
        option.apiKey,
        option.model,
        [{ role: "user", content: context }],
        1400,
        option.baseUrl,
      );
      const blueprint = parseBlueprint(reply, prompt, data);
      const svg = renderChartSvg(blueprint, data);
      return {
        spec: { ...blueprint, data },
        file: svg,
        provider: option.label,
        model: option.model,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("CHART_AI_GENERATION_FAILED");
}
