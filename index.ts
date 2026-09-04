import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ModelResponse {
  data?: Array<{ id: string }>;
}

const FALLBACK_MODELS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-3.1-flash-lite-preview",
  "minimax/minimax-m2.7",
  "z-ai/glm-5.1",
];

function toModelConfig(id: string) {
  return {
    id,
    name: `${id} (Freebuff)`,
    reasoning: false,
    input: ["text" as const, "image" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const rawBase = (process.env.FREEBUFF_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
  const baseUrl = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
  const apiKey = process.env.FREEBUFF_API_KEY || "freebuff";

  let modelIds = FALLBACK_MODELS;

  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(2000),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (res.ok) {
      const json = (await res.json()) as ModelResponse;
      if (Array.isArray(json.data) && json.data.length > 0) {
        modelIds = json.data.map((m) => m.id);
      }
    }
  } catch {
    // Freebuff2API might not be running yet; fallback models remain registered
  }

  pi.registerProvider("freebuff", {
    name: "Freebuff",
    baseUrl,
    apiKey,
    api: "openai-completions",
    models: modelIds.map(toModelConfig),
  });

  pi.registerCommand("freebuff", {
    description: "Check Freebuff2API connection and view available models",
    handler: async (_args, ctx) => {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          signal: AbortSignal.timeout(3000),
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const json = (await res.json()) as ModelResponse;
        const liveModels = (json.data || []).map((m) => m.id);

        if (liveModels.length === 0) {
          ctx.ui.notify("Connected to Freebuff2API, but no models were returned.", "warning");
          return;
        }

        if (ctx.hasUI) {
          const selected = await ctx.ui.select(
            `Freebuff Models (${liveModels.length} available):`,
            liveModels
          );
          if (selected) {
            ctx.ui.notify(`Selected: freebuff/${selected}\nSwitch with: /model or pi --model freebuff/${selected}`, "info");
          }
        } else {
          ctx.ui.notify(`Freebuff Online (${liveModels.length} models: ${liveModels.join(", ")})`, "info");
        }
      } catch (err: any) {
        ctx.ui.notify(
          `Cannot reach Freebuff2API at ${baseUrl}: ${err.message}\nMake sure Freebuff2API is running (e.g. docker run -p 8080:8080 ...)`,
          "error"
        );
      }
    },
  });
}
