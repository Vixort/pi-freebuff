import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CODEBUFF_API_URL = "https://www.codebuff.com";
const USER_AGENT = "ai-sdk/openai-compatible/1.0.25/codebuff";

// Known agent mappings for free models
const AGENT_MAP: Record<string, string> = {
  "deepseek/deepseek-v4-flash": "base3-free-deepseek-flash",
  "deepseek/deepseek-v4-pro": "base3-free-deepseek",
  "mimo/mimo-v2.5": "base3-free-mimo",
  "minimax/minimax-m3": "base3-free-minimax-m3",
  "upstage/solar-pro4": "base3-free-solar-pro4",
  "z-ai/glm-5.2": "base3-free-glm",
  "z-ai/glm-5.3-flash": "base3-free-glm-5-3-flash",
  "fable/fable-5": "base3-free-fable",
  "ox/ox-alpha": "base3-free-ox-alpha",
  "google/gemini-2.5-flash-lite": "file-picker",
};

const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash",
  "mimo/mimo-v2.5",
  "upstage/solar-pro4",
  "minimax/minimax-m3",
  "deepseek/deepseek-v4-pro",
];

function getAuthToken(): string | null {
  if (process.env.FREEBUFF_AUTH_TOKEN) {
    return process.env.FREEBUFF_AUTH_TOKEN.trim();
  }
  const credPath = path.join(os.homedir(), ".config", "manicode", "credentials.json");
  if (fs.existsSync(credPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(credPath, "utf8"));
      if (data.default?.authToken) {
        return data.default.authToken.trim();
      }
      for (const key of Object.keys(data)) {
        if (data[key]?.authToken) {
          return data[key].authToken.trim();
        }
      }
    } catch {}
  }
  return null;
}

function getBuffyMarker(model: string): string {
  return `You are Buffy, the coding agent behind Codebuff. You help users with software engineering tasks: fixing bugs, adding functionality, refactoring, and explaining code.

# Freebuff Meta-information
You are running on the ${model} model.
You are the AI agent behind Freebuff, a tool where users can chat with you to code with AI for free. See freebuff.com for more information about the product.`;
}

interface SessionCache {
  instanceId: string;
  model: string;
  expiresAt: number;
  rateLimit?: any;
}

class CodebuffClient {
  private currentSession: SessionCache | null = null;

  constructor(private token: string) {}

  async deleteSession(): Promise<void> {
    try {
      await fetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "User-Agent": USER_AGENT,
        },
      });
    } catch {}
    this.currentSession = null;
  }

  async ensureSession(model: string, retry = true): Promise<string> {
    const now = Date.now();
    if (
      this.currentSession &&
      this.currentSession.model === model &&
      this.currentSession.expiresAt > now + 15000
    ) {
      return this.currentSession.instanceId;
    }

    // If model changed or expired, clear previous session
    if (this.currentSession && this.currentSession.model !== model) {
      await this.deleteSession();
    }

    const res = await fetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "x-freebuff-model": model,
      },
      body: "{}",
    });

    if (!res.ok) {
      const errText = await res.text();
      // If session model mismatch, model locked, or session superseded/expired, delete session and retry once
      if (
        retry &&
        (res.status === 409 ||
          res.status === 410 ||
          res.status === 428 ||
          errText.includes("model_locked") ||
          errText.includes("session_model_mismatch") ||
          errText.includes("session_superseded") ||
          errText.includes("session_expired"))
      ) {
        await this.deleteSession();
        await new Promise((r) => setTimeout(r, 400));
        return this.ensureSession(model, false);
      }
      throw new Error(`Session error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const expiresAt = data.expiresAt ? Date.parse(data.expiresAt) : now + 3600000;
    this.currentSession = {
      instanceId: data.instanceId,
      model: data.model || model,
      expiresAt,
      rateLimit: data.rateLimit,
    };

    return this.currentSession.instanceId;
  }

  async startRun(agentId: string): Promise<string> {
    const res = await fetch(`${CODEBUFF_API_URL}/api/v1/agent-runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ action: "START", agentId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Start run failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { runId: string };
    return data.runId;
  }

  async finishRun(runId: string): Promise<void> {
    try {
      await fetch(`${CODEBUFF_API_URL}/api/v1/agent-runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          action: "FINISH",
          runId,
          status: "completed",
          totalSteps: 1,
          directCredits: 0,
          totalCredits: 0,
        }),
      });
    } catch {}
  }

  getSessionCache(): SessionCache | null {
    return this.currentSession;
  }
}

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
      supportsUsageInStreaming: false,
      supportsStore: false,
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const authToken = getAuthToken();
  if (!authToken) {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "Freebuff: No auth token found! Run `freebuff` CLI once or set FREEBUFF_AUTH_TOKEN.",
        "warning"
      );
    });
    return;
  }

  const client = new CodebuffClient(authToken);

  // Discover available models from session or use defaults
  let availableModels = DEFAULT_MODELS;
  try {
    const sRes = await fetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: "{}",
    });
    if (sRes.ok) {
      const sData = (await sRes.json()) as any;
      if (sData.rateLimitsByModel && typeof sData.rateLimitsByModel === "object") {
        const models = Object.keys(sData.rateLimitsByModel);
        if (models.length > 0) {
          availableModels = models;
        }
      }
    }
  } catch {}

  // Start in-process ephemeral HTTP server
  const server = http.createServer(async (req, res) => {
    const url = req.url || "";

    if (req.method === "GET" && (url === "/healthz" || url === "/v1/healthz")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && (url === "/v1/models" || url === "/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: availableModels.map((id) => ({
            id,
            object: "model",
            created: Math.floor(Date.now() / 1000),
            owned_by: "Freebuff",
          })),
        })
      );
      return;
    }

    if (req.method === "POST" && (url === "/v1/chat/completions" || url === "/chat/completions")) {
      let bodyData = "";
      req.on("data", (chunk) => {
        bodyData += chunk;
      });

      req.on("end", async () => {
        let runId: string | null = null;
        try {
          const payload = JSON.parse(bodyData);
          if (process.env.DEBUG_FREEBUFF) {
            console.error("Payload keys:", Object.keys(payload));
            if (payload.tools) console.error("Tools count:", payload.tools.length);
          }
          const requestedModel = payload.model || "deepseek/deepseek-v4-flash";
          const agentId = AGENT_MAP[requestedModel] || "base3-free-deepseek-flash";

          // 1. Ensure active session for requested model
          const instanceId = await client.ensureSession(requestedModel);

          // 2. Start agent run
          runId = await client.startRun(agentId);

          // 3. Inject Buffy system marker
          const marker = getBuffyMarker(requestedModel);
          const messages = Array.isArray(payload.messages) ? payload.messages : [];
          if (messages.length > 0 && messages[0].role === "system") {
            messages[0].content = `${marker}\n\n${messages[0].content}`;
          } else {
            messages.unshift({ role: "system", content: marker });
          }
          payload.messages = messages;

          // 4. Inject metadata
          payload.codebuff_metadata = {
            run_id: runId,
            cost_mode: "free",
            client_id: Math.random().toString(36).substring(2, 15),
            freebuff_instance_id: instanceId,
          };

          // Remove stream_options (Codebuff rejects it with 400)
          delete payload.stream_options;
          delete payload.tools;
          delete payload.tool_choice;

          const isStream = Boolean(payload.stream);
          let upstreamRes: Response | null = null;

          // Attempt up to 2 times to automatically handle session invalidation (session_superseded / session_expired)
          for (let attempt = 0; attempt < 2; attempt++) {
            // 1. Ensure active session for requested model
            const instanceId = await client.ensureSession(requestedModel);

            // 2. Start agent run
            runId = await client.startRun(agentId);

            // 3. Inject metadata
            payload.codebuff_metadata = {
              run_id: runId,
              cost_mode: "free",
              client_id: Math.random().toString(36).substring(2, 15),
              freebuff_instance_id: instanceId,
            };

            // 4. Forward to Codebuff
            upstreamRes = await fetch(`${CODEBUFF_API_URL}/api/v1/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
                Accept: isStream ? "text/event-stream" : "application/json",
              },
              body: JSON.stringify(payload),
            });

            if (upstreamRes.ok) {
              break;
            }

            // Check if error is session-related (session_superseded, session_expired, etc.)
            const errorClone = upstreamRes.clone();
            const errText = await errorClone.text();

            if (
              attempt === 0 &&
              (upstreamRes.status === 409 ||
                upstreamRes.status === 410 ||
                upstreamRes.status === 428 ||
                errText.includes("session_superseded") ||
                errText.includes("session_expired") ||
                errText.includes("session_model_mismatch") ||
                errText.includes("waiting_room_required") ||
                errText.includes("model_locked"))
            ) {
              if (runId) {
                await client.finishRun(runId);
                runId = null;
              }
              await client.deleteSession();
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }

            break;
          }

          if (!upstreamRes) {
            throw new Error("No response from upstream Codebuff");
          }

          // Forward status and headers
          res.writeHead(upstreamRes.status, {
            "Content-Type": upstreamRes.headers.get("Content-Type") || (isStream ? "text/event-stream" : "application/json"),
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          if (!upstreamRes.body) {
            res.end();
            return;
          }

          // Stream upstream response back to pi
          const reader = upstreamRes.body.getReader();
          let finished = false;

          const cleanup = async () => {
            if (finished) return;
            finished = true;
            try {
              await reader.cancel();
            } catch {}
            if (runId) {
              const r = runId;
              runId = null;
              await client.finishRun(r);
            }
          };

          req.on("close", () => {
            if (!finished) cleanup();
          });

          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } finally {
              res.end();
              await cleanup();
            }
          };

          pump().catch(async () => {
            res.end();
            await cleanup();
          });
        } catch (err: any) {
          if (runId) {
            client.finishRun(runId);
          }
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: err.message || "Internal Proxy Error" } }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  // Listen on ephemeral local port
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address() as { port: number };
  const proxyBaseUrl = `http://127.0.0.1:${address.port}/v1`;

  // Close server on session shutdown
  pi.on("session_shutdown", () => {
    server.close();
  });

  // Register provider in pi
  pi.registerProvider("freebuff", {
    name: "Freebuff (Native)",
    baseUrl: proxyBaseUrl,
    apiKey: "freebuff-native",
    api: "openai-completions",
    models: availableModels.map(toModelConfig),
  });

  // Register /freebuff command for UI
  pi.registerCommand("freebuff", {
    description: "View Freebuff models, quota, and connection status",
    handler: async (_args, ctx) => {
      const session = client.getSessionCache();
      const infoLines = [
        `Provider: Freebuff (Embedded Native - No Docker)`,
        `Auth: Token loaded (${authToken.slice(0, 8)}...)`,
        `Local Port: ${address.port}`,
        `Available Models: ${availableModels.join(", ")}`,
      ];

      if (session) {
        infoLines.push(`Active Model: ${session.model}`);
        infoLines.push(`Instance ID: ${session.instanceId}`);
        if (session.rateLimit) {
          infoLines.push(
            `Quota: ${session.rateLimit.recentCount ?? 0} / ${session.rateLimit.limit ?? "?"} (${session.rateLimit.poolLabel || "Daily"})`
          );
        }
      }

      if (ctx.hasUI) {
        const choice = await ctx.ui.select("Freebuff Status & Models:", [
          ...availableModels.map((m) => `Switch to: freebuff/${m}`),
          "Close",
        ]);
        if (choice && choice.startsWith("Switch to: ")) {
          const pickedModel = choice.replace("Switch to: ", "");
          ctx.ui.notify(
            `To use this model, run:\npi --model ${pickedModel}\nor select it via /model`,
            "info"
          );
        }
      } else {
        ctx.ui.notify(infoLines.join("\n"), "info");
      }
    },
  });
}
