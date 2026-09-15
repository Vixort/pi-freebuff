import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CODEBUFF_API_URL = "https://www.codebuff.com";
const USER_AGENT = "ai-sdk/openai-compatible/1.0.25/codebuff";

// Known agent mappings for free models
// Verified base3-free-* agents keep their dedicated mappings; newer/unknown
// models use the upstream root agent "base2-free" (reference-verified).
const AGENT_MAP: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "base3-free-deepseek-flash",
  "deepseek/deepseek-v4-flash": "base3-free-deepseek-flash",
  "deepseek/deepseek-v4-flash-max": "base2-free",
  "deepseek/deepseek-v4-pro": "base3-free-deepseek",
  "deepseek/deepseek-v4-pro-max": "base2-free",
  "mimo/mimo-v2.5": "base3-free-mimo",
  "minimax/minimax-m3": "base3-free-minimax-m3",
  "upstage/solar-pro4": "base3-free-solar-pro4",
  "z-ai/glm-5.2": "base3-free-glm",
  "z-ai/glm-5.3-flash": "base3-free-glm-5-3-flash",
  "fable/fable-5": "base3-free-fable",
  "ox/ox-alpha": "base3-free-ox-alpha",
  "stealth/ox-alpha": "base3-free-ox-alpha",
  "anthropic/claude-fable-5": "base2-free",
  "google/gemini-2.5-flash-lite": "file-picker",
  "google/gemini-3.8-flash": "base2-free",
  "google/gemini-3.5-flash-lite": "base2-free",
  "google/gemini-3.1-flash-lite": "base2-free",
  "openai/gpt-5.6-luna": "base2-free",
  "openai/gpt-5.6-luna-es": "base2-free",
  "openai/gpt-5.6-luna-max": "base2-free",
  "crof/kimi-k3-eco": "base2-free",
  "meta/muse-spark-1.2-contributor": "base2-free",
  "meta/muse-spark-1.3-contributor": "base2-free",
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
  "z-ai/glm-5.3-flash",
  "google/gemini-3.8-flash",
  "openai/gpt-5.6-luna",
  "crof/kimi-k3-eco",
  "meta/muse-spark-1.3-contributor",
  "mimo/mimo-v2.5",
  "upstage/solar-pro4",
  "minimax/minimax-m3",
  "deepseek/deepseek-v4-pro",
];

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "DeepSeek V4 Flash 07/31",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek/deepseek-v4-flash-max": "DeepSeek V4 Flash Max",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek/deepseek-v4-pro-max": "DeepSeek V4 Pro Max",
  "mimo/mimo-v2.5": "MiMo 2.5",
  "minimax/minimax-m3": "MiniMax M3",
  "upstage/solar-pro4": "Solar Pro 4",
  "z-ai/glm-5.2": "GLM 5.2",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
  "google/gemini-3.8-flash": "Gemini 3.8 Flash",
  "google/gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "openai/gpt-5.6-luna": "GPT-5.6 Luna",
  "openai/gpt-5.6-luna-es": "GPT-5.6 Luna ES",
  "openai/gpt-5.6-luna-max": "GPT-5.6 Luna Max",
  "crof/kimi-k3-eco": "Kimi K3 Eco",
  "meta/muse-spark-1.2-contributor": "Muse Spark 1.2",
  "meta/muse-spark-1.3-contributor": "Muse Spark 1.3",
  "anthropic/claude-fable-5": "Claude Fable 5",
  "stealth/ox-alpha": "Ox Alpha",
};

// Official Codebuff context windows (from freebuff-models.ts)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "z-ai/glm-5.3-flash": 1_000_000,
  "z-ai/glm-5.2": 1_000_000,
  "deepseek/deepseek-v4-flash-0731": 1_048_576,
  "deepseek/deepseek-v4-flash": 1_048_576,
  "deepseek/deepseek-v4-flash-max": 1_048_576,
  "deepseek/deepseek-v4-pro": 1_048_576,
  "deepseek/deepseek-v4-pro-max": 1_048_576,
  "openai/gpt-5.6-luna": 1_000_000,
  "openai/gpt-5.6-luna-es": 372_000,
  "openai/gpt-5.6-luna-max": 1_000_000,
  "meta/muse-spark-1.3-contributor": 1_000_000,
  "meta/muse-spark-1.2-contributor": 1_000_000,
  "stealth/ox-alpha": 1_000_000,
  "ox/ox-alpha": 1_000_000,
  "anthropic/claude-fable-5": 1_000_000,
  "google/gemini-3.8-flash": 1_000_000,
  "google/gemini-2.5-flash-lite": 1_000_000,
  "google/gemini-3.5-flash-lite": 1_000_000,
  "google/gemini-3.1-flash-lite": 1_000_000,
  "upstage/solar-pro4": 500_000,
  "minimax/minimax-m3": 524_288,
  "mimo/mimo-v2.5": 262_144,
  "crof/kimi-k3-eco": 262_144,
};

const MODEL_MAX_TOKENS: Record<string, number> = {
  "z-ai/glm-5.3-flash": 65536,
  "deepseek/deepseek-v4-flash-0731": 16384,
  "deepseek/deepseek-v4-flash": 16384,
  "deepseek/deepseek-v4-flash-max": 16384,
  "deepseek/deepseek-v4-pro": 16384,
  "deepseek/deepseek-v4-pro-max": 16384,
  "openai/gpt-5.6-luna": 32768,
  "openai/gpt-5.6-luna-es": 16384,
  "openai/gpt-5.6-luna-max": 32768,
  "upstage/solar-pro4": 16384,
  "minimax/minimax-m3": 16384,
  "mimo/mimo-v2.5": 16384,
  "google/gemini-3.8-flash": 65536,
};

// Authoritative upstream agent -> models catalog (free-agents.ts)
const FREE_AGENTS_URL =
  "https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/constants/free-agents.ts";

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

function normalizeToolArguments(toolName: string, args: Record<string, any>): Record<string, any> {
  if (!args || typeof args !== "object") return args;

  // 1. Tool: ask_user_question
  if (toolName === "ask_user_question") {
    let questions = args.questions;
    if (typeof questions === "string") {
      try {
        questions = JSON.parse(questions);
      } catch {}
    }
    if (!Array.isArray(questions)) {
      if (args.question) {
        questions = [
          {
            question: String(args.question),
            header: String(args.header || "Question").slice(0, 16),
            options: Array.isArray(args.options)
              ? args.options
              : [
                  { label: "Yes", description: "Confirm" },
                  { label: "No", description: "Cancel" },
                ],
          },
        ];
      } else {
        questions = [];
      }
    }

    // Sanitize each question strictly for TypeBox & runtime validation
    args.questions = questions.slice(0, 4).map((q: any, qIdx: number) => {
      let header = String(q.header || `Question ${qIdx + 1}`)
        .trim()
        .slice(0, 16);
      if (!header) header = `Question ${qIdx + 1}`;

      let questionText = String(q.question || "").trim();
      if (!questionText.endsWith("?")) questionText += "?";

      let options = Array.isArray(q.options) ? q.options : [];
      options = options.slice(0, 4).map((opt: any, oIdx: number) => {
        let label = String(opt.label || `Option ${oIdx + 1}`)
          .trim()
          .slice(0, 60);
        // Replace reserved labels that cause runtime validation rejections
        if (/^(Other|Type something\.|Next)$/i.test(label)) {
          label = `Choice ${oIdx + 1}`;
        }
        let description = String(opt.description || label).trim();
        return {
          label,
          description,
          ...(opt.preview ? { preview: String(opt.preview) } : {}),
        };
      });

      if (options.length < 2) {
        options.push({ label: "Confirm", description: "Proceed" });
        options.push({ label: "Cancel", description: "Abort" });
      }

      return {
        question: questionText,
        header,
        options,
        multiSelect: Boolean(q.multiSelect && q.multiSelect !== "false"),
      };
    });
  }

  // 2. Tool: bash
  if (toolName === "bash") {
    args.command = String(
      args.command || args.cmd || args.code || args.script || ""
    ).trim();
  }

  // 3. Tool: read
  if (toolName === "read") {
    if (args.offset !== undefined) args.offset = parseInt(String(args.offset), 10) || 0;
    if (args.limit !== undefined) args.limit = parseInt(String(args.limit), 10) || 0;
  }

  // 4. Tool: write
  if (toolName === "write") {
    args.content =
      args.content !== undefined
        ? String(args.content)
        : args.code !== undefined
        ? String(args.code)
        : "";
  }

  // 5. Tool: todo
  if (toolName === "todo") {
    if (args.id !== undefined) args.id = parseInt(String(args.id), 10) || 0;
  }

  // General numeric type coercion for tools expecting numbers
  for (const [k, v] of Object.entries(args)) {
    if (
      typeof v === "string" &&
      /^-?\d+$/.test(v.trim()) &&
      !["path", "command", "content", "query", "header", "label"].includes(k)
    ) {
      args[k] = parseInt(v.trim(), 10);
    }
  }

  return args;
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
      let rawToolName = invMatch[1].trim();
      // Normalize common lowercase tool names
      const knownTools = [
        "bash",
        "read",
        "write",
        "edit",
        "ask_user_question",
        "todo",
        "web_search",
        "fetch_content",
        "smart_recall",
      ];
      const toolName = knownTools.includes(rawToolName.toLowerCase())
        ? rawToolName.toLowerCase()
        : rawToolName;

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

      const normalizedArgs = normalizeToolArguments(toolName, args);

      toolCalls.push({
        id: "call_" + Math.random().toString(36).substring(2, 11),
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify(normalizedArgs),
        },
      });
    }

    // 2. If no invoke tag was found, check direct parameter tags
    if (!foundInvoke) {
      const cmdMatch = /<command>([\s\S]*?)<\/command>/i.exec(inner);
      if (cmdMatch) {
        const args = normalizeToolArguments("bash", { command: cmdMatch[1].trim() });
        toolCalls.push({
          id: "call_" + Math.random().toString(36).substring(2, 11),
          type: "function",
          function: {
            name: "bash",
            arguments: JSON.stringify(args),
          },
        });
      } else {
        const qMatch = /<questions>([\s\S]*?)<\/questions>/i.exec(inner);
        if (qMatch) {
          let qVal: any = qMatch[1].trim();
          try {
            qVal = JSON.parse(qVal);
          } catch {}
          const args = normalizeToolArguments("ask_user_question", { questions: qVal });
          toolCalls.push({
            id: "call_" + Math.random().toString(36).substring(2, 11),
            type: "function",
            function: {
              name: "ask_user_question",
              arguments: JSON.stringify(args),
            },
          });
        } else {
          const pathMatch = /<path>([\s\S]*?)<\/path>/i.exec(inner);
          if (pathMatch) {
            const args = normalizeToolArguments("read", { path: pathMatch[1].trim() });
            toolCalls.push({
              id: "call_" + Math.random().toString(36).substring(2, 11),
              type: "function",
              function: {
                name: "read",
                arguments: JSON.stringify(args),
              },
            });
          }
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

// Freebucks coin system (replaces the legacy daily quota system)
interface FreebucksDaily {
  limit?: number; // real-world field name ("granted" kept for compat)
  granted?: number;
  remaining?: number;
  spent?: number;
  resetAt?: string;
  resetsAt?: string;
}

interface FreebucksInfo {
  balance?: number;
  daily?: FreebucksDaily;
  prices?: Record<string, number>;
  [key: string]: any;
}

interface SessionCache {
  instanceId: string;
  model: string;
  expiresAt: number;
  status?: string;
  freebucks?: FreebucksInfo;
  rateLimitsByModel?: Record<string, any>;
  rateLimit?: any; // legacy quota fields (deprecated, kept for backward compat)
  countryCode?: string;
  countryBlockReason?: string;
}

function getSessionDiskPath(): string {
  return path.join(os.homedir(), ".config", "manicode", "freebuff-session-cache.json");
}

function saveSessionDisk(token: string, session: SessionCache | null): void {
  try {
    const p = getSessionDiskPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let all: Record<string, any> = {};
    if (fs.existsSync(p)) {
      try {
        all = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {}
    }
    const key = token.slice(0, 16);
    if (session && session.expiresAt > Date.now()) {
      all[key] = session;
    } else {
      delete all[key];
    }
    fs.writeFileSync(p, JSON.stringify(all, null, 2), { mode: 0o600 });
  } catch {}
}

function loadSessionDisk(token: string): SessionCache | null {
  try {
    const p = getSessionDiskPath();
    if (!fs.existsSync(p)) return null;
    const all = JSON.parse(fs.readFileSync(p, "utf8"));
    const session = all[token.slice(0, 16)];
    if (!session || typeof session !== "object") return null;
    const now = Date.now();
    if (session.expiresAt && session.expiresAt > now + 15000) {
      return session as SessionCache;
    }
  } catch {}
  return null;
}

class CodebuffClient {
  private currentSession: SessionCache | null = null;
  // Timestamp of last real traffic (ensureSession) — heartbeats back off to
  // avoid firing while an actual chat request is in flight.
  private lastActivityAt = 0;
  private heartbeating = false;

  constructor(public readonly token: string) {
    this.currentSession = loadSessionDisk(this.token);
  }

  /**
   * Keep-alive ping mimicking the official desktop client: it sends
   * GET /freebuff/session with x-freebuff-heartbeat every 45s while a session
   * is active. Skips when there was recent real traffic or the session is
   * about to expire naturally. On 4xx the cached session is dropped so the
   * next request recreates it cleanly.
   */
  async heartbeat(): Promise<void> {
    const session = this.currentSession;
    if (!session || !session.instanceId) return;
    const now = Date.now();
    if (session.expiresAt <= now + 5000) return; // expiring anyway — let it go
    if (now - this.lastActivityAt < 10000) return; // real traffic recently
    if (this.heartbeating) return;
    this.heartbeating = true;
    try {
      const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "User-Agent": USER_AGENT,
          "x-freebuff-heartbeat": "1",
          "x-freebuff-instance-id": session.instanceId,
        },
      });
      if (!res.ok) {
        // Session is no longer valid server-side — drop cache so the next
        // ensureSession() creates a fresh one.
        this.currentSession = null;
        saveSessionDisk(this.token, null);
      } else {
        const data = (await res.json().catch(() => null)) as any;
        if (data?.expiresAt) {
          const exp = Date.parse(data.expiresAt);
          if (Number.isFinite(exp) && this.currentSession) {
            this.currentSession.expiresAt = exp;
          }
        }
        if (data?.freebucks && this.currentSession) {
          this.currentSession.freebucks = data.freebucks;
        }
        if (data?.countryCode && this.currentSession) {
          this.currentSession.countryCode = data.countryCode;
        }
        if (this.currentSession) {
          this.currentSession.countryBlockReason = data?.countryBlockReason || undefined;
          saveSessionDisk(this.token, this.currentSession);
        }
      }
    } catch {}
    finally {
      this.heartbeating = false;
    }
  }

  async deleteSession(): Promise<void> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "User-Agent": USER_AGENT,
      };
      if (this.currentSession?.instanceId) {
        headers["x-freebuff-instance-id"] = this.currentSession.instanceId;
      }
      await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "DELETE",
        headers,
      });
    } catch {}
    this.currentSession = null;
    saveSessionDisk(this.token, null);
  }

  getActiveSession(targetModel?: string): SessionCache | null {
    const now = Date.now();
    if (!this.currentSession) {
      this.currentSession = loadSessionDisk(this.token);
    }
    if (!this.currentSession || !this.currentSession.instanceId) return null;
    if (this.currentSession.expiresAt <= now + 15000) {
      this.currentSession = null;
      saveSessionDisk(this.token, null);
      return null;
    }
    if (targetModel) {
      const target = MODEL_ALIASES[targetModel] || targetModel;
      const current = MODEL_ALIASES[this.currentSession.model] || this.currentSession.model;
      if (target !== current) return null;
    }
    return this.currentSession;
  }

  async startSession(model: string): Promise<{ ok: boolean; message: string; instanceId?: string }> {
    const now = Date.now();
    const targetModel = MODEL_ALIASES[model] || model;

    // Check if session for requested model is already active
    const active = this.getActiveSession(targetModel);
    if (active && active.instanceId) {
      const remainingMins = Math.ceil((active.expiresAt - now) / 60000);
      return {
        ok: true,
        instanceId: active.instanceId,
        message: `Session is already active for ${prettyModelName(active.model)} (${remainingMins}m remaining).`,
      };
    }

    // If an active session exists for another model, release it before renting a new model slot
    if (this.currentSession && this.currentSession.instanceId && this.currentSession.expiresAt > now + 15000) {
      await this.deleteSession();
      await new Promise((r) => setTimeout(r, 400));
    }

    const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "x-freebuff-model": targetModel,
      },
      body: "{}",
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const errObj = JSON.parse(errText);
        msg = errObj.message || errObj.error || errText;
        if (errObj.freebucksShortfall) {
          msg = `Not enough Freebucks! Costs ${errObj.freebucksShortfall.price} Freebucks/hr, but you have ${errObj.freebucksShortfall.balance} left.`;
        }
      } catch {}
      return { ok: false, message: `Failed to start session (${res.status}): ${msg}` };
    }

    const data = (await res.json()) as any;
    const instanceId = data.instanceId || data.instance_id;
    if (!instanceId) {
      return { ok: false, message: "Session response missing instanceId" };
    }

    const expiresAt = data.expiresAt ? Date.parse(data.expiresAt) : now + 3600000;
    this.currentSession = {
      instanceId,
      model: data.model || targetModel,
      expiresAt,
      status: "active",
      freebucks: data.freebucks || undefined,
      rateLimitsByModel: data.rateLimitsByModel || undefined,
      rateLimit: data.rateLimit,
      countryCode: data.countryCode || undefined,
      countryBlockReason: data.countryBlockReason || undefined,
    };
    saveSessionDisk(this.token, this.currentSession);

    const mins = Math.ceil((expiresAt - now) / 60000);
    return {
      ok: true,
      instanceId,
      message: `Started 1-hour session for ${prettyModelName(this.currentSession.model)} (${mins}m remaining)!`,
    };
  }

  async ensureSession(model: string): Promise<string> {
    const targetModel = MODEL_ALIASES[model] || model;
    const active = this.getActiveSession(targetModel);
    if (active && active.instanceId) {
      return active.instanceId;
    }

    const anyActive = this.getActiveSession();
    if (anyActive && anyActive.instanceId) {
      const mins = Math.ceil((anyActive.expiresAt - Date.now()) / 60000);
      throw new Error(
        `Active session is locked to ${prettyModelName(anyActive.model)} (${mins}m remaining). Switch to ${anyActive.model} in pi (/model) or run '/freebuff' to start a session for ${prettyModelName(targetModel)}.`
      );
    }

    throw new Error(
      `No active session for ${prettyModelName(targetModel)}. Run '/freebuff' (or '/freebuff start') to select your model and start a 1-hour session.`
    );
  }

  async startRun(agentId: string): Promise<string> {
    const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/agent-runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ action: "START", agentId, ancestorRunIds: [] }),
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

// ---------- Freebucks (coin) helpers ----------

function getCreditsRemaining(session: SessionCache | null): number | null {
  const fb = session?.freebucks;
  if (!fb) return null;
  const dailyRemaining = fb.daily && typeof fb.daily.remaining === "number" ? fb.daily.remaining : null;
  const balance = typeof fb.balance === "number" ? fb.balance : null;
  if (dailyRemaining !== null && balance !== null) return Math.min(dailyRemaining, balance);
  return dailyRemaining ?? balance;
}

function getModelPrice(session: SessionCache | null, model: string): number | null {
  const prices = session?.freebucks?.prices;
  if (prices && typeof prices[model] === "number") return prices[model];
  const base = MODEL_ALIASES[model] || model;
  if (base !== model && prices && typeof prices[base] === "number") return prices[base];
  return null;
}

function isNearCreditLimit(session: SessionCache | null, model: string): boolean {
  // If session is ALREADY ACTIVE and NOT EXPIRED, zero new credits are required to keep using it!
  const now = Date.now();
  if (session && session.expiresAt > now + 15000) {
    const activeModel = MODEL_ALIASES[session.model] || session.model;
    const targetModel = MODEL_ALIASES[model] || model;
    if (!model || activeModel === targetModel) {
      return false; // Active paid session: keep using it until it expires!
    }
  }

  const remaining = getCreditsRemaining(session);
  if (remaining !== null) {
    const price = getModelPrice(session, model) ?? 0;
    if (price > 0) return remaining < price;
    return remaining <= 0;
  }

  // Legacy per-model quota fallback (rateLimitsByModel / rateLimit)
  const rlByModel = session?.rateLimitsByModel?.[model] || session?.rateLimitsByModel?.[MODEL_ALIASES[model] || model];
  const rl = rlByModel || session?.rateLimit;
  if (rl && typeof rl.limit === "number" && typeof rl.recentCount === "number") {
    return rl.recentCount >= rl.limit - 0.5;
  }
  return false;
}

function formatCreditsLine(session: SessionCache | null): string | null {
  const fb = session?.freebucks;
  if (!fb) {
    const rl = session?.rateLimit;
    if (rl && typeof rl.limit === "number") {
      return `Quota (legacy): ${rl.recentCount ?? 0} / ${rl.limit}`;
    }
    return null;
  }
  const parts: string[] = [];
  if (typeof fb.balance === "number") parts.push(`Balance: ${fb.balance}`);
  if (fb.daily) {
    const granted =
      typeof fb.daily.limit === "number"
        ? fb.daily.limit
        : typeof fb.daily.granted === "number"
          ? fb.daily.granted
          : null;
    const remaining = typeof fb.daily.remaining === "number" ? fb.daily.remaining : null;
    if (granted !== null || remaining !== null) {
      parts.push(`Daily: ${remaining ?? "?"}/${granted ?? "?"}`);
    }
  }
  return parts.length > 0 ? `Credits: ${parts.join(" | ")}` : null;
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
  // Last model requested, used by the credit guard to look up per-model prices
  private lastRequestedModel: string | null = null;

  setLastRequestedModel(model: string | null): void {
    this.lastRequestedModel = model;
  }

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

  /** Like getActive() but does not count a request (used by heartbeat loop). */
  peekActive(): { state: TokenState; client: CodebuffClient } | null {
    if (this.pool.length === 0) return null;
    const current = this.pool[this.activeIndex];
    return { state: current, client: current.client };
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

    // Priority 1: Check if the current account has an ACTIVE, NON-EXPIRED session.
    // In Freebuff's credit system, a 1-hour session is paid upfront in coins.
    // NEVER switch accounts while an active valid session is running!
    const currentSession = current.client.getSessionCache();
    const hasValidActiveSession =
      currentSession &&
      currentSession.expiresAt > now + 15000 &&
      !current.isBanned &&
      current.cooldownUntil <= now;

    if (hasValidActiveSession) {
      current.requestCount++;
      current.lastUsed = now;
      return { state: current, client: current.client };
    }

    // Priority 2: If current account is banned or cooling down, rotate to a healthy account
    if (current.isBanned || current.cooldownUntil > now) {
      this.rotateNext();
      current = this.pool[this.activeIndex];
    }

    // Priority 3: Only when starting a BRAND NEW session (no active session running):
    // If current account has insufficient credits, failover to an account that can afford it
    const currentNear = currentSession
      ? isNearCreditLimit(currentSession, this.lastRequestedModel || "")
      : false;

    if (currentNear && this.pool.length > 1) {
      for (let i = 1; i <= this.pool.length; i++) {
        const nextIdx = (this.activeIndex + i) % this.pool.length;
        const candidate = this.pool[nextIdx];
        const candSession = candidate.client.getSessionCache();
        const candHasActive = candSession && candSession.expiresAt > now + 15000;
        const candNear = candSession
          ? isNearCreditLimit(candSession, this.lastRequestedModel || "")
          : false;

        if (!candidate.isBanned && candidate.cooldownUntil <= now && (candHasActive || !candNear)) {
          this.activeIndex = nextIdx;
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
        candidate.requestCount = 0;
        return true;
      }
    }
    return false;
  }

  setActive(index: number): boolean {
    if (index >= 0 && index < this.pool.length) {
      this.activeIndex = index;
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

// ---------- Model catalog helpers ----------

function matchModelShortcut(query: string, available: string[]): string | null {
  const q = query.toLowerCase().trim();
  const directAliases: Record<string, string> = {
    glm: "z-ai/glm-5.3-flash",
    "glm-5.3": "z-ai/glm-5.3-flash",
    flash: "deepseek/deepseek-v4-flash-0731",
    "0731": "deepseek/deepseek-v4-flash-0731",
    deepseek: "deepseek/deepseek-v4-flash-0731",
    mimo: "mimo/mimo-v2.5",
    solar: "upstage/solar-pro4",
    kimi: "crof/kimi-k3-eco",
    luna: "openai/gpt-5.6-luna",
    muse: "meta/muse-spark-1.3-contributor",
    minimax: "minimax/minimax-m3",
  };
  if (directAliases[q]) return directAliases[q];
  const exact = available.find((m) => m.toLowerCase() === q);
  if (exact) return exact;
  const partial = available.find((m) => m.toLowerCase().includes(q));
  if (partial) return partial;
  return null;
}

function prettyModelName(id: string): string {
  if (MODEL_DISPLAY_NAMES[id]) return MODEL_DISPLAY_NAMES[id];
  const short = id.split("/").pop() || id;
  return short
    .split("[-_.]")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Parse upstream free-agents.ts source into agent -> models[] map.
 * Handles "agent: new Set([...])" and "agent: [...]" forms.
 */
function parseFreeAgents(source: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const blockRegex = /['"]([^'"]+)['"]\s*:\s*(?:new\s+Set\(\s*)?\[([^\]]*)\]/g;
  const itemRegex = /['"]([^'"]+)['"]/g;
  let block: RegExpExecArray | null;
  while ((block = blockRegex.exec(source)) !== null) {
    const agent = block[1];
    const models: string[] = [];
    let item: RegExpExecArray | null;
    while ((item = itemRegex.exec(block[2])) !== null) {
      if (item[1] && !models.includes(item[1])) models.push(item[1]);
    }
    if (models.length > 0) result[agent] = models;
  }
  return result;
}

async function fetchUpstreamCatalog(): Promise<Record<string, string[]> | null> {
  try {
    const res = await safeFetch(FREE_AGENTS_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = parseFreeAgents(text);
    return Object.keys(parsed).length > 0 ? parsed : null;
  } catch {}
  return null;
}

function toModelConfig(id: string) {
  const baseId = MODEL_ALIASES[id] || id;
  const isReasoningModel =
    id.includes("deepseek") || id.includes("glm-5.3") || id.includes("gpt-5.6");
  const displayName = `${prettyModelName(id)} (Freebuff)`;

  const contextWindow =
    MODEL_CONTEXT_WINDOWS[id] ||
    MODEL_CONTEXT_WINDOWS[baseId] ||
    131072;

  const maxTokens =
    MODEL_MAX_TOKENS[id] ||
    MODEL_MAX_TOKENS[baseId] ||
    8192;

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
    contextWindow,
    maxTokens,
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

  // Discover available models and current balance (read-only GET — never auto-starts session)
  let availableModels = DEFAULT_MODELS;
  if (primaryEntry) {
    try {
      const sRes = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${primaryEntry.state.token}`,
          "User-Agent": USER_AGENT,
        },
      });
      if (sRes.ok) {
        const sData = (await sRes.json()) as any;

        // Authoritative base: the account's freebucks price table lists every
        // purchasable model. Merge in per-model quota entries, then enrich with
        // the upstream free-agents catalog (agent -> models) for extras.
        const merged: string[] = [];
        const push = (m: string) => {
          if (m && !merged.includes(m)) merged.push(m);
        };

        const prices = sData.freebucks?.prices;
        if (prices && typeof prices === "object") {
          for (const m of Object.keys(prices)) push(m);
        }
        if (sData.rateLimitsByModel && typeof sData.rateLimitsByModel === "object") {
          for (const m of Object.keys(sData.rateLimitsByModel)) push(m);
        }

        const catalog = await fetchUpstreamCatalog();
        if (catalog) {
          for (const models of Object.values(catalog)) {
            for (const m of models) push(m);
          }
        }

        // Legacy alias: expose both ID variants for deepseek-v4-flash
        if (merged.includes("deepseek/deepseek-v4-flash")) {
          push("deepseek/deepseek-v4-flash-0731");
        }

        if (merged.length > 0) {
          availableModels = merged;
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
          pool.setLastRequestedModel(upstreamModel);
          let activeEntry = pool.getActive();

          if (!activeEntry) {
            throw new Error("No active or healthy Freebuff tokens available in pool");
          }

          // Attempt up to 2 times to handle session renewal or token failover
          for (let attempt = 0; attempt < 2; attempt++) {
            const currentClient = activeEntry.client;
            const currentToken = activeEntry.state.token;

            // 1. Ensure active session for requested model
            let instanceId = await currentClient.ensureSession(upstreamModel);

            // Waiting room: session queued — wait briefly and retry once
            if (!instanceId) {
              await new Promise((r) => setTimeout(r, 1500));
              instanceId = await currentClient.ensureSession(upstreamModel);
              if (!instanceId) {
                throw new Error(
                  "Freebuff waiting room is full for this account. Try again shortly or rotate with /freebuff rotate."
                );
              }
            }

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
                  "Freebucks credit exhausted for this account today. Run `/freebuff` to view your balance or add another account to the pool.";
              } else if (
                errObj.status === "insufficient_credits" ||
                errObj.status === "insufficient_freebucks" ||
                errText.includes("insufficient_credits") ||
                errText.includes("insufficient_freebucks")
              ) {
                pool.markCooldown(activeEntry.state.token, 60 * 60 * 1000);
                errMsg =
                  "Not enough freebucks coins for this model. Run `/freebuff` to view your balance or rotate to another account.";
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

  // Keep-alive heartbeat: the official desktop client pings its active
  // session every ~45s (GET /freebuff/session + x-freebuff-heartbeat) to
  // prevent mid-conversation expiry. Only the active account's session is
  // pinged, and only if one exists — idle sessions with no traffic create
  // no heartbeat traffic at all.
  const HEARTBEAT_INTERVAL_MS = 45_000;
  const heartbeatTimer = setInterval(async () => {
    try {
      const entry = pool.peekActive();
      await entry?.client.heartbeat();
    } catch {}
  }, HEARTBEAT_INTERVAL_MS);
  // Don't keep the process alive just for the heartbeat (Node only)
  if (typeof (heartbeatTimer as any)?.unref === "function") {
    (heartbeatTimer as any).unref();
  }

  // Stop heartbeat and close server on shutdown (keep cloud sessions intact for their full hour!)
  pi.on("session_shutdown", () => {
    try {
      clearInterval(heartbeatTimer);
      server.close();
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
    description: "Manage Freebuff sessions, model rental, tokens, and status",
    handler: async (args, ctx) => {
      const rawArgs = (args || "").trim();
      const parts = rawArgs.split(/\s+/).filter(Boolean);
      const sub = parts[0]?.toLowerCase();
      const activeClient = pool.peekActive()?.client;

      // 1. Subcommand: /freebuff start [model]
      if (sub === "start") {
        if (!activeClient) {
          ctx.ui.notify(
            "No active account token found. Run /freebuff login first.",
            "warning"
          );
          return;
        }

        let modelArg = parts.slice(1).join(" ").trim();
        let targetModel = "";

        if (modelArg) {
          const matched = matchModelShortcut(modelArg, availableModels);
          if (!matched) {
            ctx.ui.notify(
              `Unknown model "${modelArg}". Available: ${availableModels.join(", ")}`,
              "warning"
            );
            return;
          }
          targetModel = matched;
        } else if (ctx.hasUI) {
          await activeClient.fetchSessionInfo();
          const session = activeClient.getSessionCache();
          const prices = session?.freebucks?.prices || {};
          const balance = session?.freebucks?.balance ?? "?";

          const options = availableModels.map((m) => {
            const price = getModelPrice(session ?? null, m);
            const priceText = price !== null ? `${price} Freebucks/hr` : "Standard";
            return `${prettyModelName(m)} (${priceText}) -> ${m}`;
          });

          const choice = await ctx.ui.select(
            `Select Model to Rent for 1 Hour (Balance: ${balance}):`,
            [...options, "Cancel"]
          );
          if (!choice || choice === "Cancel") return;
          targetModel = choice.split(" -> ")[1]?.trim() || "";
        }

        if (!targetModel) return;

        const price = getModelPrice(activeClient.getSessionCache(), targetModel);
        if (ctx.hasUI && price !== null) {
          const ok = await ctx.ui.confirm(
            "Confirm 1-Hour Rental",
            `Rent ${prettyModelName(targetModel)} for 1 hour? This will use ${price} Freebucks.`
          );
          if (!ok) {
            ctx.ui.notify("Rental cancelled.", "info");
            return;
          }
        }

        const res = await activeClient.startSession(targetModel);
        ctx.ui.notify(res.message, res.ok ? "info" : "error");
        return;
      }

      // 2. Subcommand: /freebuff stop / end / reset
      if (sub === "stop" || sub === "end" || sub === "reset") {
        if (activeClient) {
          await activeClient.deleteSession();
          ctx.ui.notify("Active cloud session released successfully.", "info");
        } else {
          ctx.ui.notify("No active account found.", "warning");
        }
        return;
      }

      // 3. Subcommand: /freebuff add <token>
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
        pool.addToken(tokenToAdd);
        ctx.ui.notify(
          `Token saved as [${savedKey}] and added to pool (${pool.size} account(s) ready).`,
          "info"
        );
        return;
      }

      // 4. Subcommand: /freebuff login
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

      // 5. Subcommand: /freebuff rotate
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

      // 6. Subcommand: /freebuff help
      if (sub === "help") {
        const helpText = [
          "Freebuff Commands Guide:",
          "/freebuff             - Open interactive dashboard & session manager",
          "/freebuff start       - Open model picker to rent a 1-hour session",
          "/freebuff start <mdl> - Rent 1-hour session (e.g. glm, 0731, solar)",
          "/freebuff stop        - Release current cloud session",
          "/freebuff status      - View accounts, Freebucks balance & countdown",
          "/freebuff login       - Open login link & prompt to paste token",
          "/freebuff add <token> - Add an auth token to the account pool",
          "/freebuff rotate      - Switch to next standby account",
          "/model                - Open pi native model selector",
        ].join("\n");
        ctx.ui.notify(helpText, "info");
        return;
      }

      // 7. Subcommand: /freebuff status / list / default interactive menu
      await activeClient?.fetchSessionInfo();
      const poolStatus = pool.getPoolStatus();
      const activeAccount = poolStatus.find((p) => p.isActive);
      const session = activeClient?.getSessionCache();
      const now = Date.now();
      const hasActive = Boolean(
        session && session.instanceId && session.expiresAt > now + 15000
      );
      const remainingMins = hasActive
        ? Math.max(0, Math.ceil((session!.expiresAt - now) / 60000))
        : 0;

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

      const creditsLine = formatCreditsLine(session ?? null);
      if (creditsLine) {
        infoLines.push(creditsLine);
      }

      if (hasActive) {
        infoLines.push(
          `Active Model: ${prettyModelName(session!.model)} (${remainingMins}m remaining)`
        );
        infoLines.push(`Session ID: ${session!.instanceId}`);
      } else {
        infoLines.push("Active Session: None (Type /freebuff start to rent a model)");
      }

      if (session?.countryBlockReason) {
        infoLines.push(
          `⚠ Country: ${session.countryCode || "unknown"} (${session.countryBlockReason}) — this account region may be restricted upstream`
        );
      }

      if (ctx.hasUI) {
        let menuTitle = `Freebuff [No Session | Select Model to Start]:`;
        const menuOptions: string[] = [];

        if (hasActive) {
          menuTitle = `Freebuff [${prettyModelName(session!.model)}: ${remainingMins}m left]:`;
          menuOptions.push(
            `🟢 Active: ${prettyModelName(session!.model)} (${remainingMins}m remaining)`
          );
          menuOptions.push("🔄 Switch Model (Rent New 1-Hour Session)");
          menuOptions.push("🛑 End / Release Current Session");
        } else {
          menuOptions.push("🟢 Start 1-Hour Session (Select Model & Rent)");
        }

        if (pool.size > 1) {
          menuOptions.push("Rotate to next account");
        }
        menuOptions.push("📋 View Balance & Accounts Status");
        menuOptions.push("+ Add Auth Token / Login (freebuff.llm.pm)");
        menuOptions.push("Close");

        const choice = await ctx.ui.select(menuTitle, menuOptions);
        if (
          choice === "🟢 Start 1-Hour Session (Select Model & Rent)" ||
          choice === "🔄 Switch Model (Rent New 1-Hour Session)"
        ) {
          const prices = session?.freebucks?.prices || {};
          const balance = session?.freebucks?.balance ?? "?";

          const options = availableModels.map((m) => {
            const price = getModelPrice(session ?? null, m);
            const priceText = price !== null ? `${price} Freebucks/hr` : "Standard";
            return `${prettyModelName(m)} (${priceText}) -> ${m}`;
          });

          const picked = await ctx.ui.select(
            `Select Model to Rent for 1 Hour (Balance: ${balance}):`,
            [...options, "Cancel"]
          );
          if (picked && picked !== "Cancel") {
            const targetModel = picked.split(" -> ")[1]?.trim();
            if (targetModel && activeClient) {
              const price = getModelPrice(session ?? null, targetModel);
              if (price !== null) {
                const ok = await ctx.ui.confirm(
                  "Confirm Rental",
                  `Rent ${prettyModelName(targetModel)} for 1 hour? Cost: ${price} Freebucks.`
                );
                if (!ok) {
                  ctx.ui.notify("Rental cancelled.", "info");
                  return;
                }
              }
              const res = await activeClient.startSession(targetModel);
              ctx.ui.notify(res.message, res.ok ? "info" : "error");
            }
          }
        } else if (choice === "🛑 End / Release Current Session") {
          if (activeClient) {
            await activeClient.deleteSession();
            ctx.ui.notify("Active session released.", "info");
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
        } else if (choice === "📋 View Balance & Accounts Status") {
          ctx.ui.notify(infoLines.join("\n"), "info");
        } else if (choice === "+ Add Auth Token / Login (freebuff.llm.pm)") {
          ctx.ui.notify(
            "Login Link: https://freebuff.llm.pm\nLog in with your account to get your token.",
            "info"
          );
          const inputToken = (
            await ctx.ui.input("Paste Auth Token here:", "Paste token here")
          )?.trim();
          if (inputToken) {
            const savedKey = saveAuthToken(inputToken);
            pool.addToken(inputToken);
            ctx.ui.notify(
              `Token saved as [${savedKey}]! Pool now has ${pool.size} account(s).`,
              "info"
            );
          }
        }
      } else {
        ctx.ui.notify(infoLines.join("\n"), "info");
      }
    },
  });
}
