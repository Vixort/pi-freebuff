import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CODEBUFF_API_URL = "https://www.codebuff.com";
const USER_AGENT = "ai-sdk/openai-compatible/1.0.25/codebuff";

// Known agent mappings for free models
const AGENT_MAP: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "base3-free-deepseek-flash",
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

const MODEL_ALIASES: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "deepseek/deepseek-v4-flash",
  "deepseek-v4-flash-0731": "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-flash": "deepseek/deepseek-v4-flash",
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
};

const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash-0731",
  "deepseek/deepseek-v4-flash",
  "mimo/mimo-v2.5",
  "upstage/solar-pro4",
  "minimax/minimax-m3",
  "deepseek/deepseek-v4-pro",
];

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "DeepSeek V4 Flash 07/31",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "mimo/mimo-v2.5": "MiMo 2.5",
  "minimax/minimax-m3": "MiniMax M3",
  "upstage/solar-pro4": "Solar Pro 4",
  "z-ai/glm-5.2": "GLM 5.2",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
};

let cachedDispatcher: any = null;
let dispatcherChecked = false;

function getFetchDispatcher() {
  if (dispatcherChecked) return cachedDispatcher;
  dispatcherChecked = true;
  const proxyUrl =
    process.env.FREEBUFF_HTTP_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY;

  if (proxyUrl) {
    try {
      const { ProxyAgent } = require("undici");
      cachedDispatcher = new ProxyAgent(proxyUrl);
    } catch {}
  }
  return cachedDispatcher;
}

function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const dispatcher = getFetchDispatcher();
  const options = dispatcher ? { ...(init || {}), dispatcher } : init;
  return fetch(input, options as any);
}

function saveAuthToken(newToken: string, accountKey?: string): string {
  const credPath = path.join(os.homedir(), ".config", "manicode", "credentials.json");
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  let data: Record<string, any> = {};
  if (fs.existsSync(credPath)) {
    try {
      data = JSON.parse(fs.readFileSync(credPath, "utf8"));
    } catch {}
  }

  let key = accountKey;
  if (!key) {
    if (!data.default || !data.default.authToken) {
      key = "default";
    } else if (data.default.authToken === newToken.trim()) {
      key = "default";
    } else {
      let count = 2;
      while (data[`account_${count}`]) {
        if (data[`account_${count}`].authToken === newToken.trim()) {
          key = `account_${count}`;
          break;
        }
        count++;
      }
      if (!key) key = `account_${count}`;
    }
  }

  if (!data[key]) data[key] = {};
  data[key].authToken = newToken.trim();
  fs.writeFileSync(credPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  return key;
}

function getAuthTokens(): string[] {
  const tokens: string[] = [];
  if (process.env.FREEBUFF_AUTH_TOKENS) {
    tokens.push(
      ...process.env.FREEBUFF_AUTH_TOKENS.split(",").map((t) => t.trim()).filter(Boolean)
    );
  }
  if (process.env.FREEBUFF_AUTH_TOKEN) {
    const t = process.env.FREEBUFF_AUTH_TOKEN.trim();
    if (t && !tokens.includes(t)) tokens.push(t);
  }

  const credPath = path.join(os.homedir(), ".config", "manicode", "credentials.json");
  if (fs.existsSync(credPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(credPath, "utf8"));
      if (Array.isArray(data.tokens)) {
        for (const t of data.tokens) {
          if (typeof t === "string" && t.trim() && !tokens.includes(t.trim())) {
            tokens.push(t.trim());
          }
        }
      }
      for (const key of Object.keys(data)) {
        const val = data[key];
        if (val && typeof val === "object" && val.authToken) {
          const t = String(val.authToken).trim();
          if (t && !tokens.includes(t)) tokens.push(t);
        }
      }
    } catch {}
  }

  return tokens;
}

function getBuffyMarker(model: string): string {
  return `You are Buffy, the coding agent behind Codebuff. You help users with software engineering tasks: fixing bugs, adding functionality, refactoring, and explaining code.

# Freebuff Meta-information
You are running on the ${model} model.
You are the AI agent behind Freebuff, a tool where users can chat with you to code with AI for free. See freebuff.com for more information about the product.

To call any tool, use the standard DSML tool format:
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="tool_name">
<｜｜DSML｜｜parameter name="param_name" string="true">value</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`;
}

function extractToolCallsFromText(rawText: string): {
  cleanText: string;
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
} {
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

  // Match any block starting with <*DSML*...> or <toolcall> or <tool_call> or <invocation>
  const blockRegex =
    /(?:<[|｜]+DSML[|｜]+[^>]*>|<toolcall>|<tool_call>|<invocation[^>]*>)([\s\S]*?)(?:<\/[|｜]+DSML[|｜]+[^>]*>|<\/toolcall>|<\/tool_call>|<\/invocation>|$)/gi;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(rawText)) !== null) {
    const inner = blockMatch[1].trim();
    if (!inner) continue;

    // 1. Check if there is an explicit invoke / invocation tag
    const invokeRegex =
      /<(?:[|｜]+DSML[|｜]+)?(?:invoke|invocation)\s+name="([^"]+)"(?:\s+[^>]*)?>([\s\S]*?)(?:<\/(?:[|｜]+DSML[|｜]+)?(?:invoke|invocation)>|$)/gi;
    let invMatch: RegExpExecArray | null;
    let foundInvoke = false;

    while ((invMatch = invokeRegex.exec(inner)) !== null) {
      foundInvoke = true;
      const toolName = invMatch[1].trim();
      const body = invMatch[2];
      const args: Record<string, any> = {};

      const pRegex =
        /<(?:[|｜]+DSML[|｜]+)?(?:parameter|param)\s+name="([^"]+)"(?:\s+[^>]*)?>([\s\S]*?)(?:<\/(?:[|｜]+DSML[|｜]+)?(?:parameter|param)>|$)/gi;
      let p: RegExpExecArray | null;
      while ((p = pRegex.exec(body)) !== null) {
        const pName = p[1].trim();
        const pVal = p[2].trim();
        try {
          if (
            (pVal.startsWith("{") && pVal.endsWith("}")) ||
            (pVal.startsWith("[") && pVal.endsWith("]"))
          ) {
            args[pName] = JSON.parse(pVal);
          } else {
            args[pName] = pVal;
          }
        } catch {
          args[pName] = pVal;
        }
      }

      const directTags = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/gi;
      let dt: RegExpExecArray | null;
      while ((dt = directTags.exec(body)) !== null) {
        if (!["parameter", "param", "invoke", "invocation", "toolcall", "tool_call"].includes(dt[1])) {
          args[dt[1]] = dt[2].trim();
        }
      }

      toolCalls.push({
        id: "call_" + Math.random().toString(36).substring(2, 11),
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      });
    }

    // 2. If no invoke tag was found, check direct parameter tags (like <command>...</command> -> bash)
    if (!foundInvoke) {
      const cmdMatch = /<command>([\s\S]*?)<\/command>/i.exec(inner);
      if (cmdMatch) {
        toolCalls.push({
          id: "call_" + Math.random().toString(36).substring(2, 11),
          type: "function",
          function: {
            name: "bash",
            arguments: JSON.stringify({ command: cmdMatch[1].trim() }),
          },
        });
      } else {
        const pathMatch = /<path>([\s\S]*?)<\/path>/i.exec(inner);
        if (pathMatch) {
          toolCalls.push({
            id: "call_" + Math.random().toString(36).substring(2, 11),
            type: "function",
            function: {
              name: "read",
              arguments: JSON.stringify({ path: pathMatch[1].trim() }),
            },
          });
        }
      }
    }
  }

  // Deduplicate identical consecutive tool calls if model hallucinated/repeated
  const uniqueToolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
  for (const tc of toolCalls) {
    const isDup = uniqueToolCalls.some(
      (u) => u.function.name === tc.function.name && u.function.arguments === tc.function.arguments
    );
    if (!isDup) uniqueToolCalls.push(tc);
  }

  // Extract clean text (text before the first tool call block)
  const firstBlockIdx = rawText.search(/(?:<[|｜]+DSML[|｜]+|<toolcall|<tool_call|<invocation)/i);
  const cleanText = firstBlockIdx !== -1 ? rawText.slice(0, firstBlockIdx).trim() : rawText.trim();

  return { cleanText, toolCalls: uniqueToolCalls };
}

class DSMLStreamTransformer {
  private inDSML = false;
  private dsmlBuffer = "";
  private carry = "";

  constructor(
    private res: http.ServerResponse,
    private id: string,
    private model: string
  ) {}

  feedReasoning(reasoning: string) {
    if (!reasoning) return;
    const chunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          delta: { reasoning_content: reasoning },
          finish_reason: null,
        },
      ],
    };
    this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  feedText(text: string) {
    if (this.inDSML) {
      this.dsmlBuffer += text;
      return;
    }

    const combined = this.carry + text;
    const dsmlMatch = /(?:<[|｜]+DSML[|｜]+|<toolcall|<tool_call|<invocation)/i.exec(combined);

    if (dsmlMatch) {
      this.inDSML = true;
      const pre = combined.slice(0, dsmlMatch.index);
      if (pre.length > 0) {
        this.emitContentDelta(pre);
      }
      this.dsmlBuffer = combined.slice(dsmlMatch.index);
      this.carry = "";
    } else {
      const partialIdx = combined.lastIndexOf("<");
      if (partialIdx !== -1 && combined.length - partialIdx < 25) {
        const emitText = combined.slice(0, partialIdx);
        this.carry = combined.slice(partialIdx);
        if (emitText.length > 0) {
          this.emitContentDelta(emitText);
        }
      } else {
        this.emitContentDelta(combined);
        this.carry = "";
      }
    }
  }

  private emitContentDelta(content: string) {
    const chunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    };
    this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  finish() {
    if (this.carry.length > 0) {
      if (this.inDSML) {
        this.dsmlBuffer += this.carry;
      } else {
        this.emitContentDelta(this.carry);
      }
      this.carry = "";
    }

    if (this.inDSML || /(?:<[|｜]+DSML[|｜]+|<toolcall|<tool_call|<invocation)/i.test(this.dsmlBuffer)) {
      const { toolCalls } = extractToolCallsFromText(this.dsmlBuffer);
      if (toolCalls.length > 0) {
        const chunk = {
          id: this.id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: this.model,
          choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: "tool_calls" }],
        };
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        this.res.write("data: [DONE]\n\n");
        return;
      }
    }

    const endChunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    this.res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
    this.res.write("data: [DONE]\n\n");
  }
}

interface SessionCache {
  instanceId: string;
  model: string;
  expiresAt: number;
  rateLimit?: any;
}

class CodebuffClient {
  private currentSession: SessionCache | null = null;

  constructor(public readonly token: string) {}

  async deleteSession(): Promise<void> {
    try {
      await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
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

    const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
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
    const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/agent-runs`, {
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
      await safeFetch(`${CODEBUFF_API_URL}/api/v1/agent-runs`, {
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

interface TokenState {
  token: string;
  name: string;
  client: CodebuffClient;
  requestCount: number;
  lastUsed: number;
  cooldownUntil: number;
  isBanned: boolean;
}

class RequestPacer {
  private lastRequestTime = 0;

  async pace(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const minGap = 350;
    if (this.lastRequestTime > 0 && elapsed < minGap) {
      const jitter = minGap - elapsed + Math.floor(Math.random() * 200 + 100);
      await new Promise((r) => setTimeout(r, jitter));
    }
    this.lastRequestTime = Date.now();
  }
}

class TokenPool {
  private pool: TokenState[] = [];
  private activeIndex = 0;
  // Sticky parameters: rotate after 25 requests or 1 hour
  private switchAfterRequests = 25;
  private switchAfterDurationMs = 60 * 60 * 1000;
  private activeStartedAt = Date.now();

  constructor(tokens: string[]) {
    this.pool = tokens.map((token, i) => ({
      token,
      name: `Account ${i + 1} (${token.slice(0, 6)}...)`,
      client: new CodebuffClient(token),
      requestCount: 0,
      lastUsed: 0,
      cooldownUntil: 0,
      isBanned: false,
    }));
  }

  get size(): number {
    return this.pool.length;
  }

  addToken(token: string, name?: string): TokenState {
    const clean = token.trim();
    const existing = this.pool.find((p) => p.token === clean);
    if (existing) {
      existing.isBanned = false;
      existing.cooldownUntil = 0;
      return existing;
    }
    const idx = this.pool.length + 1;
    const entry: TokenState = {
      token: clean,
      name: name || `Account ${idx} (${clean.slice(0, 6)}...)`,
      client: new CodebuffClient(clean),
      requestCount: 0,
      lastUsed: 0,
      cooldownUntil: 0,
      isBanned: false,
    };
    this.pool.push(entry);
    return entry;
  }

  getActive(): { state: TokenState; client: CodebuffClient } | null {
    if (this.pool.length === 0) return null;
    const now = Date.now();
    let current = this.pool[this.activeIndex];

    // Check sticky rotation (time-based or request-based)
    const shouldRotate =
      this.pool.length > 1 &&
      (current.requestCount >= this.switchAfterRequests ||
        now - this.activeStartedAt > this.switchAfterDurationMs);

    if (shouldRotate || current.isBanned || current.cooldownUntil > now) {
      this.rotateNext();
      current = this.pool[this.activeIndex];
    }

    // Proactive Quota Guard: Check if current token is near its limit
    const currentSession = current.client.getSessionCache();
    const currentRL = currentSession?.rateLimit;
    const isNearLimit =
      currentRL &&
      typeof currentRL.limit === "number" &&
      typeof currentRL.recentCount === "number" &&
      currentRL.recentCount >= currentRL.limit - 0.5;

    if (isNearLimit && this.pool.length > 1) {
      for (let i = 1; i <= this.pool.length; i++) {
        const nextIdx = (this.activeIndex + i) % this.pool.length;
        const candidate = this.pool[nextIdx];
        const candSession = candidate.client.getSessionCache();
        const candRL = candSession?.rateLimit;
        const candNear =
          candRL &&
          typeof candRL.limit === "number" &&
          typeof candRL.recentCount === "number" &&
          candRL.recentCount >= candRL.limit - 0.5;

        if (!candidate.isBanned && candidate.cooldownUntil <= now && !candNear) {
          this.activeIndex = nextIdx;
          this.activeStartedAt = now;
          candidate.requestCount = 0;
          current = candidate;
          break;
        }
      }
    }

    if (current.isBanned || current.cooldownUntil > now) {
      const healthyIdx = this.pool.findIndex(
        (p) => !p.isBanned && p.cooldownUntil <= now
      );
      if (healthyIdx !== -1) {
        this.activeIndex = healthyIdx;
        current = this.pool[this.activeIndex];
      }
    }

    current.requestCount++;
    current.lastUsed = now;
    return { state: current, client: current.client };
  }

  rotateNext(manual = false): boolean {
    if (this.pool.length <= 1) return false;
    const now = Date.now();
    for (let i = 1; i <= this.pool.length; i++) {
      const idx = (this.activeIndex + i) % this.pool.length;
      const candidate = this.pool[idx];
      if (manual || (!candidate.isBanned && candidate.cooldownUntil <= now)) {
        this.activeIndex = idx;
        this.activeStartedAt = now;
        candidate.requestCount = 0;
        return true;
      }
    }
    return false;
  }

  setActive(index: number): boolean {
    if (index >= 0 && index < this.pool.length) {
      this.activeIndex = index;
      this.activeStartedAt = Date.now();
      this.pool[index].requestCount = 0;
      return true;
    }
    return false;
  }

  markCooldown(token: string, durationMs = 30 * 60 * 1000): void {
    const item = this.pool.find((p) => p.token === token);
    if (item) {
      item.cooldownUntil = Date.now() + durationMs;
      this.rotateNext();
    }
  }

  markBanned(token: string): void {
    const item = this.pool.find((p) => p.token === token);
    if (item) {
      item.isBanned = true;
      this.rotateNext();
    }
  }

  async cleanupAll(): Promise<void> {
    const promises = this.pool.map((p) => p.client.deleteSession());
    await Promise.allSettled(promises);
  }

  getPoolStatus() {
    const now = Date.now();
    return this.pool.map((p, idx) => ({
      index: idx,
      name: p.name,
      token: p.token,
      isActive: idx === this.activeIndex,
      isBanned: p.isBanned,
      inCooldown: p.cooldownUntil > now,
      cooldownMinutes:
        p.cooldownUntil > now ? Math.ceil((p.cooldownUntil - now) / 60000) : 0,
      requests: p.requestCount,
    }));
  }
}

function toModelConfig(id: string) {
  const isReasoningModel = id.includes("deepseek") || id.includes("glm-5.3");
  const displayName = MODEL_DISPLAY_NAMES[id]
    ? `${MODEL_DISPLAY_NAMES[id]} (Freebuff)`
    : `${id} (Freebuff)`;

  return {
    id,
    name: displayName,
    reasoning: isReasoningModel,
    thinkingLevelMap: isReasoningModel
      ? {
          low: "low",
          medium: "medium",
          high: "high",
          max: "max",
        }
      : undefined,
    input: ["text" as const, "image" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: isReasoningModel,
      supportsUsageInStreaming: false,
      supportsStore: false,
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const authTokens = getAuthTokens();
  if (authTokens.length === 0) {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "Freebuff: No auth token loaded. Type /freebuff to add a token or get login link.",
        "warning"
      );
    });
  }

  const pool = new TokenPool(authTokens);
  const pacer = new RequestPacer();
  const primaryEntry = pool.getActive();

  // Discover available models from primary session or use defaults
  let availableModels = DEFAULT_MODELS;
  if (primaryEntry) {
    try {
      const sRes = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${primaryEntry.state.token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: "{}",
      });
      if (sRes.ok) {
        const sData = (await sRes.json()) as any;
        if (sData.rateLimitsByModel && typeof sData.rateLimitsByModel === "object") {
          const models: string[] = [];
          for (const m of Object.keys(sData.rateLimitsByModel)) {
            if (m === "deepseek/deepseek-v4-flash") {
              models.push("deepseek/deepseek-v4-flash-0731");
              models.push("deepseek/deepseek-v4-flash");
            } else {
              models.push(m);
            }
          }
          if (models.length > 0) {
            availableModels = models;
          }
        }
      }
    } catch {}
  }

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
        let activeRunInfo: { client: CodebuffClient; runId: string } | null = null;
        try {
          const payload = JSON.parse(bodyData);
          if (process.env.DEBUG_FREEBUFF) {
            console.error("Payload keys:", Object.keys(payload));
            if (payload.tools) console.error("Tools count:", payload.tools.length);
          }
          const requestedModel = payload.model || "deepseek/deepseek-v4-flash-0731";
          const upstreamModel = MODEL_ALIASES[requestedModel] || requestedModel;
          const agentId = AGENT_MAP[requestedModel] || AGENT_MAP[upstreamModel] || "base3-free-deepseek-flash";

          // Inject Buffy system marker
          const marker = getBuffyMarker(upstreamModel);
          const messages = Array.isArray(payload.messages) ? payload.messages : [];
          if (messages.length > 0 && messages[0].role === "system") {
            messages[0].content = `${marker}\n\n${messages[0].content}`;
          } else {
            messages.unshift({ role: "system", content: marker });
          }
          payload.messages = messages;
          payload.model = upstreamModel; // Send upstream-compatible model ID

          // Remove stream_options and tools from body (avoid 400/404 from Codebuff)
          delete payload.stream_options;
          delete payload.tools;
          delete payload.tool_choice;

          const isStream = Boolean(payload.stream);
          let upstreamRes: Response | null = null;
          let activeEntry = pool.getActive();

          if (!activeEntry) {
            throw new Error("No active or healthy Freebuff tokens available in pool");
          }

          // Attempt up to 2 times to handle session renewal or token failover
          for (let attempt = 0; attempt < 2; attempt++) {
            const currentClient = activeEntry.client;
            const currentToken = activeEntry.state.token;

            // 1. Ensure active session for requested model
            const instanceId = await currentClient.ensureSession(upstreamModel);

            // 2. Start agent run
            const runId = await currentClient.startRun(agentId);
            activeRunInfo = { client: currentClient, runId };

            // 3. Inject metadata
            payload.codebuff_metadata = {
              run_id: runId,
              cost_mode: "free",
              client_id: Math.random().toString(36).substring(2, 15),
              freebuff_instance_id: instanceId,
            };

            // 4. Humanized Jitter & Pacing
            await pacer.pace();

            // 5. Forward to Codebuff
            upstreamRes = await safeFetch(`${CODEBUFF_API_URL}/api/v1/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${currentToken}`,
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
                Accept: isStream ? "text/event-stream" : "application/json",
              },
              body: JSON.stringify(payload),
            });

            if (upstreamRes.ok) {
              break;
            }

            // Inspect error response
            const errorClone = upstreamRes.clone();
            const errText = await errorClone.text();

            if (attempt === 0) {
              if (activeRunInfo) {
                await activeRunInfo.client.finishRun(activeRunInfo.runId);
                activeRunInfo = null;
              }

              // Check if token banned -> failover to next token!
              if (upstreamRes.status === 403 && errText.includes("banned")) {
                pool.markBanned(currentToken);
                const nextEntry = pool.getActive();
                if (nextEntry && nextEntry.state.token !== currentToken) {
                  activeEntry = nextEntry;
                  continue;
                }
              }

              // Check if rate limited -> failover to next token!
              if (upstreamRes.status === 429 && errText.includes("rate_limited")) {
                pool.markCooldown(currentToken, 60 * 60 * 1000);
                const nextEntry = pool.getActive();
                if (nextEntry && nextEntry.state.token !== currentToken) {
                  activeEntry = nextEntry;
                  continue;
                }
              }

              // Check if session invalid -> delete session and retry once
              if (
                upstreamRes.status === 409 ||
                upstreamRes.status === 410 ||
                upstreamRes.status === 428 ||
                errText.includes("session_superseded") ||
                errText.includes("session_expired") ||
                errText.includes("session_model_mismatch") ||
                errText.includes("waiting_room_required") ||
                errText.includes("model_locked")
              ) {
                await currentClient.deleteSession();
                await new Promise((r) => setTimeout(r, 400));
                continue;
              }
            }

            break;
          }

          if (!upstreamRes) {
            throw new Error("No response from upstream Codebuff");
          }

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            let errMsg = errText;
            try {
              const errObj = JSON.parse(errText);
              errMsg = errObj.message || errObj.error || errText;
              if (errObj.status === "banned") {
                errMsg =
                  "This Freebuff account has been suspended. Please run `/freebuff` or `./manage.sh add <TOKEN>` to add a new token.";
              } else if (errObj.status === "rate_limited") {
                errMsg =
                  "Daily quota reached for this account. Run `/freebuff` to add another account to the pool.";
              }
            } catch {}

            res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: { message: `Freebuff error (${upstreamRes.status}): ${errMsg}` },
              })
            );
            if (activeRunInfo) {
              await activeRunInfo.client.finishRun(activeRunInfo.runId);
              activeRunInfo = null;
            }
            return;
          }

          if (!isStream) {
            const data = (await upstreamRes.json()) as any;
            const choice = data.choices?.[0];
            if (
              choice?.message?.content &&
              /(?:<[|｜]+DSML[|｜]+|<toolcall|<tool_call|<invocation)/i.test(choice.message.content)
            ) {
              const { cleanText, toolCalls } = extractToolCallsFromText(choice.message.content);
              if (toolCalls.length > 0) {
                choice.message.content = cleanText || null;
                choice.message.tool_calls = toolCalls;
                choice.finish_reason = "tool_calls";
              }
            }
            res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(data));
            if (activeRunInfo) {
              await activeRunInfo.client.finishRun(activeRunInfo.runId);
              activeRunInfo = null;
            }
            return;
          }

          // Forward status and headers for streaming
          res.writeHead(upstreamRes.status, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          if (!upstreamRes.body) {
            res.end();
            return;
          }

          // Stream upstream response back to pi with DSML parsing
          const reader = upstreamRes.body.getReader();
          let finished = false;

          const cleanup = async () => {
            if (finished) return;
            finished = true;
            try {
              await reader.cancel();
            } catch {}
            if (activeRunInfo) {
              const info = activeRunInfo;
              activeRunInfo = null;
              await info.client.finishRun(info.runId);
            }
          };

          req.on("close", () => {
            if (!finished) cleanup();
          });

          const transformer = new DSMLStreamTransformer(
            res,
            "chatcmpl-" + Math.random().toString(36).substring(2, 12),
            requestedModel
          );

          const decoder = new TextDecoder();
          let sseBuffer = "";

          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split("\n");
                sseBuffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data: ")) continue;
                  const dataStr = trimmed.slice(6).trim();
                  if (dataStr === "[DONE]") continue;

                  try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta?.reasoning_content) {
                      transformer.feedReasoning(delta.reasoning_content);
                    }
                    if (delta?.content) {
                      transformer.feedText(delta.content);
                    }
                  } catch {}
                }
              }
            } finally {
              transformer.finish();
              res.end();
              await cleanup();
            }
          };

          pump().catch(async () => {
            res.end();
            await cleanup();
          });
        } catch (err: any) {
          if (activeRunInfo) {
            await activeRunInfo.client.finishRun(activeRunInfo.runId);
            activeRunInfo = null;
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

  // Close server and cleanup sessions on session shutdown
  pi.on("session_shutdown", async () => {
    try {
      server.close();
      await pool.cleanupAll();
    } catch {}
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
    description: "Manage Freebuff tokens, rotation, models, and status",
    handler: async (args, ctx) => {
      const rawArgs = (args || "").trim();
      const parts = rawArgs.split(/\s+/).filter(Boolean);
      const sub = parts[0]?.toLowerCase();

      // 1. Subcommand: /freebuff add <token>
      if (sub === "add") {
        let tokenToAdd = parts.slice(1).join(" ").trim();
        if (!tokenToAdd && ctx.hasUI) {
          tokenToAdd = (
            await ctx.ui.input(
              "Enter Freebuff Auth Token (from https://freebuff.llm.pm):",
              "Paste token here"
            )
          )?.trim();
        }
        if (!tokenToAdd) {
          ctx.ui.notify("No token entered.", "warning");
          return;
        }
        const savedKey = saveAuthToken(tokenToAdd);
        const added = pool.addToken(tokenToAdd);
        ctx.ui.notify(
          `Token saved as [${savedKey}] and added to pool (${pool.size} account(s) ready).`,
          "info"
        );
        return;
      }

      // 2. Subcommand: /freebuff login
      if (sub === "login") {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "1. Open https://freebuff.llm.pm in browser\n2. Log in and copy your Auth Token\n3. Paste it in the prompt below.",
            "info"
          );
          const inputToken = (
            await ctx.ui.input(
              "Paste Auth Token from https://freebuff.llm.pm:",
              "Paste token here"
            )
          )?.trim();
          if (inputToken) {
            const savedKey = saveAuthToken(inputToken);
            pool.addToken(inputToken);
            ctx.ui.notify(
              `Token saved as [${savedKey}]! Pool now has ${pool.size} account(s).`,
              "info"
            );
          }
        } else {
          ctx.ui.notify(
            "Login at https://freebuff.llm.pm then run /freebuff add <token>",
            "info"
          );
        }
        return;
      }

      // 3. Subcommand: /freebuff rotate
      if (sub === "rotate") {
        const rotated = pool.rotateNext(true);
        const newActive = pool.getPoolStatus().find((p) => p.isActive);
        ctx.ui.notify(
          rotated
            ? `Rotated active account to: ${newActive?.name}`
            : "Could not rotate (need 2+ healthy accounts in pool).",
          "info"
        );
        return;
      }

      // 4. Subcommand: /freebuff list or status
      const poolStatus = pool.getPoolStatus();
      const activeAccount = poolStatus.find((p) => p.isActive);
      const activeClient = primaryEntry?.client;
      const session = activeClient?.getSessionCache();

      const accountLines = poolStatus.map(
        (p) =>
          `[${p.isActive ? "ACTIVE" : "STANDBY"}] ${p.name} - ${p.requests} reqs${
            p.isBanned ? " (BANNED)" : p.inCooldown ? ` (COOLDOWN ${p.cooldownMinutes}m)` : ""
          }`
      );

      const infoLines = [
        `Provider: Freebuff (Embedded Native - No Docker)`,
        `Token Pool: ${pool.size} account(s) loaded`,
        ...accountLines,
        `Active Account: ${activeAccount?.name || "None"}`,
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
        const menuOptions: string[] = [
          "+ Add Auth Token / Login (freebuff.llm.pm)",
        ];
        if (pool.size > 1) {
          menuOptions.push("Rotate to next account");
        }
        menuOptions.push(...availableModels.map((m) => `Switch to: freebuff/${m}`));
        menuOptions.push("Close");

        const choice = await ctx.ui.select("Freebuff Status & Options:", menuOptions);
        if (choice === "+ Add Auth Token / Login (freebuff.llm.pm)") {
          ctx.ui.notify(
            "Login Link: https://freebuff.llm.pm\nLog in with your account to get your token.",
            "info"
          );
          const inputToken = (
            await ctx.ui.input(
              "Paste Auth Token here:",
              "Paste token here"
            )
          )?.trim();
          if (inputToken) {
            const savedKey = saveAuthToken(inputToken);
            pool.addToken(inputToken);
            ctx.ui.notify(
              `Token saved as [${savedKey}]! Pool now has ${pool.size} account(s).`,
              "info"
            );
          }
        } else if (choice === "Rotate to next account") {
          const rotated = pool.rotateNext(true);
          const newActive = pool.getPoolStatus().find((p) => p.isActive);
          ctx.ui.notify(
            rotated
              ? `Switched active account to: ${newActive?.name}`
              : "Could not rotate to another account.",
            "info"
          );
        } else if (choice && choice.startsWith("Switch to: ")) {
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
