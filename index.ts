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

To call any tool, use direct tool XML tags:
<tool_name>
{ "param_name": "value" }
</tool_name>
or the standard DSML tool format:
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="tool_name">
<｜｜DSML｜｜parameter name="param_name" string="true">value</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>

# CRITICAL EXECUTION DIRECTIVE:
If you need to inspect, explore, search, read files, or run commands to complete the task, you MUST invoke the tool immediately in your response turn. NEVER output conversational filler saying what you plan to do and stop your turn without calling the tool. Call the tool immediately.`;
}

function schemaToCompactSignature(name: string, description: string, parameters?: any): string {
  const props = parameters?.properties;
  if (!props || typeof props !== "object" || Object.keys(props).length === 0) {
    let sig = `### Tool: \`${name}()\``;
    if (description) sig += `\n${description}`;
    return sig;
  }

  const requiredList: string[] = Array.isArray(parameters?.required) ? parameters.required : [];
  const requiredSet = new Set(requiredList);

  const formatType = (schema: any): string => {
    if (!schema || typeof schema !== "object") return "any";
    if (Array.isArray(schema.enum)) {
      return schema.enum.map((v: any) => JSON.stringify(v)).join(" | ");
    }
    if (schema.type === "array") {
      const itemType = schema.items ? formatType(schema.items) : "any";
      return itemType.includes("|") ? `(${itemType})[]` : `${itemType}[]`;
    }
    if (schema.type === "object") {
      if (schema.properties && typeof schema.properties === "object") {
        const inner = Object.entries(schema.properties)
          .map(([k, v]: [string, any]) => {
            const isReq = Array.isArray(schema.required) && schema.required.includes(k);
            return `${k}${isReq ? "" : "?"}: ${formatType(v)}`;
          })
          .join("; ");
        return `{ ${inner} }`;
      }
      return "Record<string, any>";
    }
    if (schema.type === "string") return "string";
    if (schema.type === "number" || schema.type === "integer") return "number";
    if (schema.type === "boolean") return "boolean";
    return schema.type || "any";
  };

  const paramSignatures: string[] = [];
  const paramDocs: string[] = [];

  for (const [propName, propSchema] of Object.entries(props) as [string, any][]) {
    const isRequired = requiredSet.has(propName);
    const typeStr = formatType(propSchema);
    paramSignatures.push(`${propName}${isRequired ? "" : "?"}: ${typeStr}`);
    if (propSchema?.description) {
      paramDocs.push(`  - \`${propName}\`: ${String(propSchema.description).trim()}`);
    }
  }

  const sig = `### Tool: \`${name}(${paramSignatures.join(", ")})\``;
  const docLines: string[] = [];
  if (description) {
    docLines.push(description);
  }
  if (paramDocs.length > 0) {
    docLines.push(`Parameters:\n${paramDocs.join("\n")}`);
  }

  return `${sig}\n${docLines.join("\n")}`.trim();
}

function formatToolsForSystemPrompt(tools?: any[]): string {
  if (!Array.isArray(tools) || tools.length === 0) return "";

  const toolSections: string[] = [];
  for (const t of tools) {
    const fn = t?.function || t;
    if (!fn || !fn.name) continue;
    const name = String(fn.name).trim();
    const desc = fn.description ? String(fn.description).trim() : "";
    try {
      toolSections.push(schemaToCompactSignature(name, desc, fn.parameters));
    } catch {
      let paramsStr = "{}";
      if (fn.parameters) {
        try {
          paramsStr = JSON.stringify(fn.parameters, null, 2);
        } catch {}
      }
      toolSections.push(`### Tool: \`${name}\`\n${desc ? desc + "\n" : ""}Parameters JSON Schema:\n\`\`\`json\n${paramsStr}\n\`\`\``);
    }
  }

  if (toolSections.length === 0) return "";

  return `# Available Tools
You have access to the following tools:

${toolSections.join("\n\n")}

# Tool Calling Instructions & Autonomous Agent Directives
1. When you need to call a tool, call it IMMEDIATELY by outputting direct XML tags:
<tool_name>
{
  "param_name": "param_value"
}
</tool_name>
Or using standard DSML format:
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="tool_name">
<｜｜DSML｜｜parameter name="param_name" string="true">param_value</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>

2. CRITICAL AUTONOMOUS DIRECTIVE (ZERO-STOP POLICY):
- You are operating inside an autonomous non-interactive execution loop.
- NEVER pause or stop after receiving a tool result to announce your next step!
- When you receive a tool result (e.g. file lists, command outputs), analyze it and IMMEDIATELY call the next tool in the exact same response turn.
- FORBIDDEN: Outputting conversational text like "ขั้นตอนที่ 2: อ่านไฟล์ src/router.ts ครับ" and stopping without calling the tool!
- MANDATORY: If you announce an intention to inspect or read files (e.g. "ดู route ทั้งหมดจาก src/router.ts และ src/App.tsx ครับ"), you MUST include the tool call tag (<read> or <ctx_batch_execute> or <bash>) immediately in that same message.
- Stopping without emitting a tool call breaks the agent loop and causes immediate failure.
- CROSS-PLATFORM COMPATIBILITY: Always use forward slashes (/) for file paths (e.g. "src/utils/file.ts" or "C:/project/src"). Forward slashes work natively and reliably on both Windows and Linux, avoiding backslash escape bugs.

3. Autonomous Multi-Turn Example:
User: "Analyze the project structure and routes"
Assistant: "I will explore the codebase structure.
<ctx_batch_execute>
{
  "commands": [
    { "command": "find src -maxdepth 2", "label": "src tree" }
  ]
}
</ctx_batch_execute>"
User: "[Tool Result for ctx_batch_execute]:
src/router.ts
src/App.tsx"
Assistant: "Found router.ts and App.tsx. I will read both files immediately.
<ctx_batch_execute>
{
  "commands": [
    { "command": "cat src/router.ts", "label": "router" },
    { "command": "cat src/App.tsx", "label": "app" }
  ]
}
</ctx_batch_execute>"`;
}

function normalizeMessagesForUpstream(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];

  const callIdToName: Record<string, string> = {};

  return messages.map((m) => {
    const msg = { ...m };

    // 1. Assistant message with tool_calls:
    // If assistant message has tool_calls, reconstruct XML tags in content
    if (msg.role === "assistant") {
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        let toolXml = "";
        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name || tc.name;
          const fnArgs = tc.function?.arguments || tc.arguments || "{}";
          if (tc.id && fnName) {
            callIdToName[tc.id] = fnName;
          }
          if (fnName) {
            let formattedArgs = fnArgs;
            if (typeof fnArgs === "object") {
              try {
                formattedArgs = JSON.stringify(fnArgs, null, 2);
              } catch {}
            }
            toolXml += `\n<${fnName}>\n${formattedArgs}\n</${fnName}>\n`;
          }
        }
        msg.content = ((msg.content || "") + toolXml).trim();
        delete msg.tool_calls;
      }
    }

    // 2. Tool result message:
    // Upstream Codebuff does not accept role: "tool" without tools schema.
    // Convert role: "tool" into role: "user" with clear tool result demarcation.
    if (msg.role === "tool") {
      const toolName = callIdToName[msg.tool_call_id] || "tool";
      msg.role = "user";
      msg.content = `[Tool Result for ${toolName}]:\n${msg.content || ""}`;
      delete msg.tool_call_id;
    }

    return msg;
  });
}

const KNOWN_BUILTIN_TOOLS = new Set<string>([
  "bash",
  "powershell",
  "read",
  "write",
  "edit",
  "ask_user_question",
  "todo",
  "web_search",
  "fetch_content",
  "smart_recall",
  "ctx_batch_execute",
  "ctx_execute",
  "ctx_execute_file",
  "ctx_search",
]);

function buildToolStartRegex(toolNames?: Set<string>): RegExp {
  const merged = new Set<string>(KNOWN_BUILTIN_TOOLS);
  if (toolNames) {
    for (const name of toolNames) {
      if (typeof name === "string" && name.trim()) {
        merged.add(name.trim());
      }
    }
  }

  const escaped = Array.from(merged)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const toolPattern = escaped ? `|<(?:${escaped})\\b` : "";
  return new RegExp(
    `(?:<[|｜]+DSML[|｜]+|<toolcall\\b|<tool_call\\b|<tool_calls\\b|<invocation\\b|<invoke\\b|<action\\b|<function_calls\\b|<ctx_[a-zA-Z0-9_]+\\b${toolPattern})`,
    "i"
  );
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

  // 2. Tool: bash & powershell
  if (toolName === "bash" || toolName === "powershell") {
    let cmd = String(
      args.command || args.cmd || args.code || args.script || ""
    );
    // Normalize Windows CRLF to LF and remove carriage returns
    cmd = cmd.replace(/\r\n/g, "\n").replace(/\r/g, "");

    // Unwrap accidental raw JSON strings if fallback leaked
    if (cmd.startsWith("{") && cmd.includes('"command"')) {
      try {
        const parsed = JSON.parse(cmd);
        if (parsed.command) cmd = String(parsed.command);
      } catch {
        const m = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cmd);
        if (m) cmd = m[1].replace(/\\"/g, '"');
      }
    }

    // For bash: normalize Windows paths with backslashes to forward slashes
    if (toolName === "bash") {
      cmd = cmd.replace(/([a-zA-Z]:)\\(?![\s;&|])/g, "$1/");
      cmd = cmd.replace(/(?<=[a-zA-Z0-9_.-])\\(?=[a-zA-Z0-9_.-])/g, "/");
    }

    args.command = cmd.trim();
  }

  // 3. Tool: read
  if (toolName === "read") {
    if (typeof args.path === "string") args.path = args.path.replace(/\\/g, "/");
    if (args.offset !== undefined) args.offset = parseInt(String(args.offset), 10) || 0;
    if (args.limit !== undefined) args.limit = parseInt(String(args.limit), 10) || 0;
  }

  // 4. Tool: write & edit
  if (toolName === "write" || toolName === "edit") {
    if (typeof args.path === "string") args.path = args.path.replace(/\\/g, "/");
    if (toolName === "write") {
      args.content =
        args.content !== undefined
          ? String(args.content)
          : args.code !== undefined
          ? String(args.code)
          : "";
    }
  }

  // 5. Tool: todo
  if (toolName === "todo") {
    if (args.id !== undefined) args.id = parseInt(String(args.id), 10) || 0;
  }

  // 6. Tool: ctx_batch_execute
  if (toolName === "ctx_batch_execute") {
    if (typeof args.commands === "string") {
      try {
        args.commands = JSON.parse(args.commands);
      } catch {}
    }
    if (typeof args.queries === "string") {
      try {
        args.queries = JSON.parse(args.queries);
      } catch {}
    }
    if (Array.isArray(args.commands)) {
      args.commands = args.commands.map((cmd: any) => {
        if (typeof cmd === "string") return { command: cmd };
        if (cmd && typeof cmd === "object") {
          return {
            command: String(cmd.command || cmd.cmd || "").trim(),
            ...(cmd.label ? { label: String(cmd.label).trim() } : {}),
            ...(cmd.description ? { description: String(cmd.description).trim() } : {}),
          };
        }
        return cmd;
      });
    }
    if (Array.isArray(args.queries)) {
      args.queries = args.queries.map((q: any) => String(q).trim()).filter(Boolean);
    }
  }

  // 7. Tool: ctx_execute
  if (toolName === "ctx_execute") {
    args.command = String(args.command || args.cmd || "").trim();
  }

  // 8. Tool: ctx_search
  if (toolName === "ctx_search") {
    args.query = String(args.query || args.q || args.queries || "").trim();
  }

  // 9. Tool: ctx_execute_file
  if (toolName === "ctx_execute_file") {
    args.path = String(args.path || args.file || "").trim();
  }

  // General numeric type coercion for tools expecting numbers
  for (const [k, v] of Object.entries(args)) {
    if (
      typeof v === "string" &&
      /^-?\d+$/.test(v.trim()) &&
      !["path", "command", "content", "query", "header", "label", "commands", "queries"].includes(k)
    ) {
      args[k] = parseInt(v.trim(), 10);
    }
  }

  return args;
}

function repairJson(raw: string): any {
  if (!raw || typeof raw !== "string") return null;

  let str = raw.trim();

  // Strip markdown code fences
  str = str.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  // Fast path: try native JSON.parse first
  try {
    return JSON.parse(str);
  } catch {}

  // Sanitize Windows backslashes inside JSON strings:
  // 1. Convert Windows drive paths like C:\foo\bar or C:\\foo\\bar to C:/foo/bar
  str = str.replace(/([a-zA-Z]:\\\\?)([^"\n\r]*)/g, (_m, drive, rest) => {
    return drive[0] + ":/" + rest.replace(/\\\\?/g, "/");
  });
  // 2. Escape orphan unescaped backslashes not followed by valid JSON escape char
  str = str.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");

  try {
    return JSON.parse(str);
  } catch {}

  // 1. Remove JavaScript style comments // ... and /* ... */
  str = str.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^\\])\/\/.*$/gm, "$1");

  // 2. Remove trailing commas before } or ]
  str = str.replace(/,\s*([}\]])/g, "$1");

  // 3. Fix unquoted property names: { foo: "bar" } or , foo: 123
  str = str.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

  // 4. Handle single quotes for strings: replace '...' with "..."
  str = str.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, p1) => {
    return `"${p1.replace(/"/g, '\\"')}"`;
  });

  // Try parsing after basic cleanup
  try {
    return JSON.parse(str);
  } catch {}

  // 5. Balance unclosed brackets and braces using LIFO stack (e.g. truncated tool outputs)
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === "}") stack.pop();
      } else if (ch === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === "]") stack.pop();
      }
    }
  }

  // If in unclosed string, close the quote
  let balanced = str;
  if (inString) {
    balanced += '"';
  }
  // Remove any trailing comma before closing
  balanced = balanced.replace(/,\s*$/, "");
  // Close delimiters in exact LIFO nesting order
  while (stack.length > 0) {
    balanced += stack.pop();
  }

  try {
    return JSON.parse(balanced);
  } catch {}

  // 6. Extraction fallback: try to find the outermost valid { ... } or [ ... ]
  const firstBrace = str.indexOf("{");
  const firstBracket = str.indexOf("[");
  let startIdx = -1;
  let isObject = true;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    isObject = true;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    isObject = false;
  }

  if (startIdx !== -1) {
    const sub = str.slice(startIdx);
    for (let endIdx = sub.length; endIdx > 0; endIdx--) {
      const ch = sub[endIdx - 1];
      if ((isObject && ch === "}") || (!isObject && ch === "]")) {
        const candidate = sub.slice(0, endIdx);
        try {
          return JSON.parse(candidate);
        } catch {}
      }
    }
  }

  return null;
}

function parseArgsFromContent(body: string, toolName: string): Record<string, any> {
  let cleaned = (body || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  // 1. Direct JSON (object or array) or repaired JSON
  const repaired = repairJson(cleaned);
  if (repaired && typeof repaired === "object") {
    return normalizeToolArguments(
      toolName,
      Array.isArray(repaired) ? { commands: repaired } : repaired
    );
  }

  // 2. XML parameters <parameter name="..."> or <param name="...">
  const args: Record<string, any> = {};
  const pRegex =
    /<(?:[|｜]+DSML[|｜]+)?(?:parameter|param)\s+name="([^"]+)"(?:\s+[^>]*)?>([\s\S]*?)(?:<\/(?:[|｜]+DSML[|｜]+)?(?:parameter|param)>|$)/gi;
  let p: RegExpExecArray | null;
  let hasParam = false;
  while ((p = pRegex.exec(body)) !== null) {
    hasParam = true;
    const pName = p[1].trim();
    const pVal = p[2].trim();
    const parsedVal = repairJson(pVal);
    if (parsedVal !== null && typeof parsedVal === "object") {
      args[pName] = parsedVal;
    } else {
      args[pName] = pVal;
    }
  }
  if (hasParam) return normalizeToolArguments(toolName, args);

  // 3. Direct XML tags e.g. <commands>...</commands>, <queries>...</queries>
  const directTags = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/gi;
  let dt: RegExpExecArray | null;
  let hasTags = false;
  while ((dt = directTags.exec(body)) !== null) {
    if (
      !["parameter", "param", "invoke", "invocation", "toolcall", "tool_call", "action"].includes(
        dt[1]
      )
    ) {
      hasTags = true;
      let val = dt[2].trim();
      const parsedVal = repairJson(val);
      if (parsedVal !== null && typeof parsedVal === "object") {
        args[dt[1]] = parsedVal;
      } else {
        args[dt[1]] = val;
      }
    }
  }
  if (hasTags) return normalizeToolArguments(toolName, args);

  // 4. String fallback for single-string tools
  if (toolName === "bash" || toolName === "powershell") return normalizeToolArguments(toolName, { command: cleaned });
  if (toolName === "read") return normalizeToolArguments(toolName, { path: cleaned });
  if (toolName === "ctx_execute") return normalizeToolArguments(toolName, { command: cleaned });
  if (toolName === "ctx_search") return normalizeToolArguments(toolName, { query: cleaned });

  return normalizeToolArguments(toolName, {});
}

function detectHeuristicToolCalls(
  text: string,
  availableTools: Set<string>
): Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> {
  if (!text || text.length < 5) return [];

  const synthesized: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

  // 1. File reading heuristic
  // Matches: "อ่านไฟล์ src/router.ts", "ดูไฟล์ components/App.tsx", "check file src/index.ts", "read file /foo/bar.json"
  const fileReadRegex =
    /(?:จะ|ขอ)?(?:อ่านไฟล์|ดูไฟล์|ตรวจสอบไฟล์|เปิดไฟล์|read(?:\s+the)?\s+file|inspect(?:\s+the)?\s+file|check(?:\s+the)?\s+file|cat\s+file)\s*[:`'"\s]*([a-zA-Z0-9_./\\-]+\.(?:tsx?|jsx?|json|md|php|py|go|rs|html?|s?css|ya?ml|sh|env|toml|sql)\b)[`'"\s]*/i;
  const fileMatch = fileReadRegex.exec(text);

  if (fileMatch && fileMatch[1]) {
    const filePath = fileMatch[1].trim();
    if (availableTools.has("read")) {
      synthesized.push({
        id: "call_heur_" + Math.random().toString(36).substring(2, 9),
        type: "function",
        function: {
          name: "read",
          arguments: JSON.stringify({ path: filePath }),
        },
      });
    } else if (availableTools.has("ctx_batch_execute")) {
      synthesized.push({
        id: "call_heur_" + Math.random().toString(36).substring(2, 9),
        type: "function",
        function: {
          name: "ctx_batch_execute",
          arguments: JSON.stringify({
            commands: [{ command: `cat ${filePath}`, label: `read ${filePath}` }],
          }),
        },
      });
    } else if (availableTools.has("bash")) {
      synthesized.push({
        id: "call_heur_" + Math.random().toString(36).substring(2, 9),
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({ command: `cat ${filePath}` }),
        },
      });
    } else if (availableTools.has("powershell")) {
      synthesized.push({
        id: "call_heur_" + Math.random().toString(36).substring(2, 9),
        type: "function",
        function: {
          name: "powershell",
          arguments: JSON.stringify({ command: `Get-Content ${filePath}` }),
        },
      });
    }
  }

  // 2. Command execution heuristic
  // Matches: "รันคำสั่ง `npm test`", "run command `git status`", "execute `ls -la`"
  if (synthesized.length === 0) {
    const cmdRegex =
      /(?:จะ|ขอ)?(?:รันคำสั่ง|รันคอมมานด์|สั่งรัน|run(?:\s+the)?\s+command|execute(?:\s+the)?\s+command)\s*[:\s]*`([^`\n\r]+)`/i;
    const cmdMatch = cmdRegex.exec(text);
    if (cmdMatch && cmdMatch[1]) {
      const command = cmdMatch[1].trim();
      if (availableTools.has("bash")) {
        synthesized.push({
          id: "call_heur_" + Math.random().toString(36).substring(2, 9),
          type: "function",
          function: {
            name: "bash",
            arguments: JSON.stringify({ command }),
          },
        });
      } else if (availableTools.has("powershell")) {
        synthesized.push({
          id: "call_heur_" + Math.random().toString(36).substring(2, 9),
          type: "function",
          function: {
            name: "powershell",
            arguments: JSON.stringify({ command }),
          },
        });
      } else if (availableTools.has("ctx_batch_execute")) {
        synthesized.push({
          id: "call_heur_" + Math.random().toString(36).substring(2, 9),
          type: "function",
          function: {
            name: "ctx_batch_execute",
            arguments: JSON.stringify({
              commands: [{ command, label: command.slice(0, 30) }],
            }),
          },
        });
      }
    }
  }

  return synthesized;
}

function extractToolCallsFromText(
  rawText: string,
  availableToolNames?: Set<string>
): {
  cleanText: string;
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
} {
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
  const tools = new Set<string>(KNOWN_BUILTIN_TOOLS);
  if (availableToolNames) {
    for (const t of availableToolNames) tools.add(t);
  }

  let earliestToolIdx = -1;
  const markEarliest = (idx: number) => {
    if (idx !== -1 && (earliestToolIdx === -1 || idx < earliestToolIdx)) {
      earliestToolIdx = idx;
    }
  };

  // 1. Check container blocks: <...DSML...> ... </...DSML...>, <toolcall>...</toolcall>, <tool_call>...</tool_call>, <tool_calls>...</tool_calls>, <function_calls>...</function_calls>
  const containerRegex =
    /(?:<[|｜]+DSML[|｜]+[^>]*>|<tool_calls>|<function_calls>|<toolcall>|<tool_call>)([\s\S]*?)(?:<\/[|｜]+DSML[|｜]+[^>]*>|<\/tool_calls>|<\/function_calls>|<\/toolcall>|<\/tool_call>|$)/gi;
  let cMatch: RegExpExecArray | null;
  while ((cMatch = containerRegex.exec(rawText)) !== null) {
    markEarliest(cMatch.index);
    const inner = cMatch[1].trim();
    if (!inner) continue;

    // Check if inner is direct JSON for tool_call: {"name": "...", "arguments": ...}
    let cleanedInner = inner.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (cleanedInner.startsWith("{") && cleanedInner.endsWith("}")) {
      try {
        const parsed = JSON.parse(cleanedInner);
        if (parsed.name) {
          const tName = String(parsed.name).trim();
          let tArgs = parsed.arguments !== undefined ? parsed.arguments : (parsed.parameters || {});
          if (typeof tArgs === "string") {
            try {
              tArgs = JSON.parse(tArgs);
            } catch {}
          }
          toolCalls.push({
            id: "call_" + Math.random().toString(36).substring(2, 11),
            type: "function",
            function: {
              name: tName,
              arguments: JSON.stringify(
                normalizeToolArguments(tName, typeof tArgs === "object" && tArgs !== null ? tArgs : {})
              ),
            },
          });
          continue;
        }
      } catch {}
    }

    // Check for invoke/invocation/action tags inside container
    const invokeRegex =
      /<(?:[|｜]+DSML[|｜]+)?(?:invoke|invocation|action)\s+name="([^"]+)"(?:\s+[^>]*)?>([\s\S]*?)(?:<\/(?:[|｜]+DSML[|｜]+)?(?:invoke|invocation|action)>|$)/gi;
    let invMatch: RegExpExecArray | null;
    let foundInvoke = false;
    while ((invMatch = invokeRegex.exec(inner)) !== null) {
      foundInvoke = true;
      const toolName = invMatch[1].trim();
      const args = parseArgsFromContent(invMatch[2], toolName);
      toolCalls.push({
        id: "call_" + Math.random().toString(36).substring(2, 11),
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      });
    }

    // Check for direct tool tags inside container (e.g. <ctx_batch_execute>...</ctx_batch_execute>)
    if (!foundInvoke) {
      const tagRegex = /<([a-zA-Z0-9_.-]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
      let tr: RegExpExecArray | null;
      let foundDirectTag = false;
      while ((tr = tagRegex.exec(inner)) !== null) {
        const tName = tr[1].trim();
        if (tools.has(tName) || tName.startsWith("ctx_")) {
          foundDirectTag = true;
          const args = parseArgsFromContent(tr[2], tName);
          toolCalls.push({
            id: "call_" + Math.random().toString(36).substring(2, 11),
            type: "function",
            function: {
              name: tName,
              arguments: JSON.stringify(args),
            },
          });
        }
      }

      // Legacy parameter fallbacks inside container
      if (!foundDirectTag) {
        const cmdMatch = /<command>([\s\S]*?)<\/command>/i.exec(inner);
        if (cmdMatch) {
          const shellTool = tools.has("powershell") && !tools.has("bash") ? "powershell" : "bash";
          toolCalls.push({
            id: "call_" + Math.random().toString(36).substring(2, 11),
            type: "function",
            function: {
              name: shellTool,
              arguments: JSON.stringify(normalizeToolArguments(shellTool, { command: cmdMatch[1].trim() })),
            },
          });
        } else {
          const qMatch = /<questions>([\s\S]*?)<\/questions>/i.exec(inner);
          if (qMatch) {
            let qVal: any = qMatch[1].trim();
            try {
              qVal = JSON.parse(qVal);
            } catch {}
            toolCalls.push({
              id: "call_" + Math.random().toString(36).substring(2, 11),
              type: "function",
              function: {
                name: "ask_user_question",
                arguments: JSON.stringify(
                  normalizeToolArguments("ask_user_question", { questions: qVal })
                ),
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
                  arguments: JSON.stringify(normalizeToolArguments("read", { path: pathMatch[1].trim() })),
                },
              });
            }
          }
        }
      }
    }
  }

  // 2. Standalone invoke tags outside containers: <invoke name="...">...</invoke>
  const standaloneInvokeRegex =
    /<(?:invoke|invocation|action)\s+name="([^"]+)"(?:\s+[^>]*)?>([\s\S]*?)(?:<\/(?:invoke|invocation|action)>|$)/gi;
  let saMatch: RegExpExecArray | null;
  while ((saMatch = standaloneInvokeRegex.exec(rawText)) !== null) {
    markEarliest(saMatch.index);
    const toolName = saMatch[1].trim();
    const args = parseArgsFromContent(saMatch[2], toolName);
    toolCalls.push({
      id: "call_" + Math.random().toString(36).substring(2, 11),
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    });
  }

  // 3. Direct tool tags anywhere in rawText: <ctx_batch_execute>...</ctx_batch_execute>, <bash>...</bash>, etc.
  const directToolRegex = /<([a-zA-Z0-9_.-]+)(?:\s+[^>]*)?>([\s\S]*?)(?:<\/\1>|$)/gi;
  let dtMatch: RegExpExecArray | null;
  while ((dtMatch = directToolRegex.exec(rawText)) !== null) {
    const tagName = dtMatch[1].trim();
    if (
      /^(?:[|｜]+DSML[|｜]+.*|toolcall|tool_call|tool_calls|function_calls|invoke|invocation|action|parameter|param|questions|question|command|commands|queries|query|path|options|option)$/i.test(
        tagName
      )
    ) {
      continue;
    }

    if (tools.has(tagName) || tagName.startsWith("ctx_")) {
      markEarliest(dtMatch.index);
      const args = parseArgsFromContent(dtMatch[2], tagName);
      toolCalls.push({
        id: "call_" + Math.random().toString(36).substring(2, 11),
        type: "function",
        function: {
          name: tagName,
          arguments: JSON.stringify(args),
        },
      });
    }
  }

  // Deduplicate identical consecutive tool calls
  const uniqueToolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
  for (const tc of toolCalls) {
    const isDup = uniqueToolCalls.some(
      (u) => u.function.name === tc.function.name && u.function.arguments === tc.function.arguments
    );
    if (!isDup) uniqueToolCalls.push(tc);
  }

  // Safety Heuristic Intent Fallback: if model announced intent without XML tags
  if (uniqueToolCalls.length === 0) {
    const heuristics = detectHeuristicToolCalls(rawText, tools);
    if (heuristics.length > 0) {
      console.log(
        `[Freebuff Tool Fallback] Model announced intent without XML tags; synthesized tool call: ${heuristics[0].function.name}`
      );
      return { cleanText: rawText.trim(), toolCalls: heuristics };
    }
  }

  const cleanText = earliestToolIdx !== -1 ? rawText.slice(0, earliestToolIdx).trim() : rawText.trim();
  return { cleanText, toolCalls: uniqueToolCalls };
}

class DSMLStreamTransformer {
  private inDSML = false;
  private dsmlBuffer = "";
  private carry = "";
  private toolStartRegex: RegExp;
  private hasNativeToolCalls = false;
  private emittedToolCallCount = 0;
  private fullTextBuffer = "";

  private totalReasoningLength = 0;

  constructor(
    private res: http.ServerResponse,
    private id: string,
    private model: string,
    private availableToolNames?: Set<string>
  ) {
    this.toolStartRegex = buildToolStartRegex(this.availableToolNames);
  }

  getMetrics() {
    return {
      completionChars: this.fullTextBuffer.length + this.dsmlBuffer.length,
      reasoningChars: this.totalReasoningLength,
      toolCallsCount: this.emittedToolCallCount,
    };
  }

  feedReasoning(reasoning: string) {
    if (!reasoning) return;
    this.totalReasoningLength += reasoning.length;
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

  feedNativeToolCalls(toolCalls: any[]) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;
    this.hasNativeToolCalls = true;
    const chunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: null }],
    };
    this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  feedText(text: string) {
    if (this.inDSML) {
      this.dsmlBuffer += text;
      this.checkAndEmitEarlyToolCalls();
      return;
    }

    const combined = this.carry + text;
    const toolMatch = this.toolStartRegex.exec(combined);

    if (toolMatch) {
      this.inDSML = true;
      const pre = combined.slice(0, toolMatch.index);
      if (pre.length > 0) {
        this.emitContentDelta(pre);
      }
      this.dsmlBuffer = combined.slice(toolMatch.index);
      this.carry = "";
      this.checkAndEmitEarlyToolCalls();
    } else {
      const partialIdx = combined.lastIndexOf("<");
      if (
        partialIdx !== -1 &&
        !combined.slice(partialIdx).includes(">") &&
        combined.length - partialIdx < 80 &&
        /^<[a-zA-Z0-9_|/: -]*$/.test(combined.slice(partialIdx))
      ) {
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
    this.fullTextBuffer += content;
    const chunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    };
    this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  private checkAndEmitEarlyToolCalls() {
    // Only check if closing tag is found in dsmlBuffer
    if (!/<\/(?:[a-zA-Z0-9_.-]+|[|｜]+DSML[|｜]+[^>]*)>/i.test(this.dsmlBuffer)) {
      return;
    }

    const { toolCalls } = extractToolCallsFromText(this.dsmlBuffer, this.availableToolNames);
    if (toolCalls.length > this.emittedToolCallCount) {
      const newCalls = toolCalls.slice(this.emittedToolCallCount);
      for (let i = 0; i < newCalls.length; i++) {
        const globalIdx = this.emittedToolCallCount + i;
        const tc = newCalls[i];
        const chunk = {
          id: this.id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: this.model,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: globalIdx,
                    id: tc.id,
                    type: "function" as const,
                    function: tc.function,
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      this.emittedToolCallCount = toolCalls.length;
    }
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

    if (this.hasNativeToolCalls) {
      const endChunk = {
        id: this.id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: this.model,
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      };
      this.res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
      this.res.write("data: [DONE]\n\n");
      return;
    }

    if (this.inDSML || this.toolStartRegex.test(this.dsmlBuffer)) {
      const { toolCalls } = extractToolCallsFromText(this.dsmlBuffer, this.availableToolNames);
      if (toolCalls.length > this.emittedToolCallCount) {
        const remaining = toolCalls.slice(this.emittedToolCallCount);
        for (let i = 0; i < remaining.length; i++) {
          const globalIdx = this.emittedToolCallCount + i;
          const tc = remaining[i];
          const chunk = {
            id: this.id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: this.model,
            choices: [
              {
                index: globalIdx,
                id: tc.id,
                type: "function" as const,
                function: tc.function,
              },
            ],
          };
          this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        this.emittedToolCallCount = toolCalls.length;
      }

      if (this.emittedToolCallCount > 0) {
        const endChunk = {
          id: this.id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: this.model,
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        };
        this.res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
        this.res.write("data: [DONE]\n\n");
        return;
      } else {
        // Fallback: if tool parsing produced 0 calls, never drop the buffer silently!
        if (this.dsmlBuffer.length > 0) {
          this.emitContentDelta(this.dsmlBuffer);
        }
      }
    }

    // Heuristic Intent Fallback for streaming when model outputted intent without XML tags
    if (this.emittedToolCallCount === 0 && this.availableToolNames && this.availableToolNames.size > 0) {
      const heuristics = detectHeuristicToolCalls(this.fullTextBuffer, this.availableToolNames);
      if (heuristics.length > 0) {
        console.log(
          `[Freebuff Tool Fallback] Streamed text contained tool intent without XML tags; synthesized tool call: ${heuristics[0].function.name}`
        );
        const tc = heuristics[0];
        const chunk = {
          id: this.id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: this.model,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: tc.id,
                    type: "function" as const,
                    function: tc.function,
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        const endChunk = {
          id: this.id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: this.model,
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        };
        this.res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
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

interface FreebuffSettings {
  autoSession: boolean;
  lastUsedModel?: string;
}

let inMemorySettings: FreebuffSettings | null = null;
let userExplicitlyStopped = false;
let lastAutoRentAttemptTime = 0;

function getSettingsDiskPath(): string {
  return path.join(os.homedir(), ".config", "manicode", "freebuff-settings.json");
}

function loadFreebuffSettings(): FreebuffSettings {
  if (inMemorySettings) return inMemorySettings;
  try {
    const p = getSettingsDiskPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      inMemorySettings = {
        autoSession: Boolean(data.autoSession),
        lastUsedModel: typeof data.lastUsedModel === "string" ? data.lastUsedModel : undefined,
      };
      return inMemorySettings;
    }
  } catch {}
  inMemorySettings = { autoSession: false };
  return inMemorySettings;
}

function saveFreebuffSettings(patch: Partial<FreebuffSettings>): FreebuffSettings {
  const current = loadFreebuffSettings();
  const updated: FreebuffSettings = { ...current, ...patch };
  inMemorySettings = updated;
  try {
    const p = getSettingsDiskPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(updated, null, 2), { mode: 0o600 });
  } catch {}
  return updated;
}

function isAutoSessionEnabled(): boolean {
  return loadFreebuffSettings().autoSession;
}

function setAutoSessionEnabled(enabled: boolean): void {
  saveFreebuffSettings({ autoSession: enabled });
}

function getLastUsedModel(): string | null {
  return loadFreebuffSettings().lastUsedModel || null;
}

function setLastUsedModel(model: string): void {
  if (!model || typeof model !== "string") return;
  const normalized = MODEL_ALIASES[model] || model;
  saveFreebuffSettings({ lastUsedModel: normalized });
}

function isUserExplicitlyStopped(): boolean {
  return userExplicitlyStopped;
}

function setUserExplicitlyStopped(val: boolean): void {
  userExplicitlyStopped = val;
}

// ==========================================
// Token Usage & Cost Savings Analytics Engine
// ==========================================

interface ModelStats {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  savedUsd: number;
}

interface FreebuffStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalToolCalls: number;
  totalSavedUsd: number;
  firstUsedAt: number;
  lastUsedAt: number;
  byModel: Record<string, ModelStats>;
}

const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  // Anthropic Claude
  "anthropic/claude-3-7-sonnet": { prompt: 3.0, completion: 15.0 },
  "anthropic/claude-3.7-sonnet": { prompt: 3.0, completion: 15.0 },
  "anthropic/claude-3-5-sonnet": { prompt: 3.0, completion: 15.0 },
  "anthropic/claude-3.5-sonnet": { prompt: 3.0, completion: 15.0 },
  "anthropic/claude-3-5-haiku": { prompt: 0.8, completion: 4.0 },
  "anthropic/claude-3.5-haiku": { prompt: 0.8, completion: 4.0 },
  "anthropic/claude-3-haiku": { prompt: 0.25, completion: 1.25 },
  "anthropic/claude-3-opus": { prompt: 15.0, completion: 75.0 },
  // OpenAI
  "openai/gpt-4o": { prompt: 2.5, completion: 10.0 },
  "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/o3-mini": { prompt: 1.1, completion: 4.4 },
  "openai/o1": { prompt: 15.0, completion: 60.0 },
  "openai/o1-mini": { prompt: 1.1, completion: 4.4 },
  // DeepSeek
  "deepseek/deepseek-r1": { prompt: 0.55, completion: 2.19 },
  "deepseek/deepseek-chat": { prompt: 0.14, completion: 0.28 },
  "deepseek/deepseek-v4-flash-0731": { prompt: 0.14, completion: 0.28 },
  // Google Gemini
  "google/gemini-2.5-pro": { prompt: 1.25, completion: 5.0 },
  "google/gemini-2.5-flash": { prompt: 0.15, completion: 0.6 },
  "google/gemini-2.0-flash": { prompt: 0.1, completion: 0.4 },
  "google/gemini-1.5-pro": { prompt: 1.25, completion: 5.0 },
  "google/gemini-1.5-flash": { prompt: 0.075, completion: 0.3 },
  // Qwen
  "qwen/qwen-2.5-coder-32b": { prompt: 0.2, completion: 0.6 },
  // Default fallback
  default: { prompt: 1.5, completion: 6.0 },
};

function getStatsDiskPath(): string {
  return path.join(os.homedir(), ".config", "manicode", "freebuff-stats.json");
}

let inMemoryStats: FreebuffStats | null = null;

function createEmptyStats(): FreebuffStats {
  return {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalReasoningTokens: 0,
    totalToolCalls: 0,
    totalSavedUsd: 0,
    firstUsedAt: Date.now(),
    lastUsedAt: Date.now(),
    byModel: {},
  };
}

function loadFreebuffStats(): FreebuffStats {
  if (inMemoryStats) return inMemoryStats;
  try {
    const p = getStatsDiskPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      inMemoryStats = {
        totalRequests: Number(data.totalRequests) || 0,
        totalPromptTokens: Number(data.totalPromptTokens) || 0,
        totalCompletionTokens: Number(data.totalCompletionTokens) || 0,
        totalReasoningTokens: Number(data.totalReasoningTokens) || 0,
        totalToolCalls: Number(data.totalToolCalls) || 0,
        totalSavedUsd: Number(data.totalSavedUsd) || 0,
        firstUsedAt: Number(data.firstUsedAt) || Date.now(),
        lastUsedAt: Number(data.lastUsedAt) || Date.now(),
        byModel: typeof data.byModel === "object" && data.byModel !== null ? data.byModel : {},
      };
      return inMemoryStats;
    }
  } catch {}
  inMemoryStats = createEmptyStats();
  return inMemoryStats;
}

function saveFreebuffStats(stats: FreebuffStats): void {
  inMemoryStats = stats;
  try {
    const p = getStatsDiskPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(stats, null, 2), { mode: 0o600 });
  } catch {}
}

function resetFreebuffStats(): void {
  inMemoryStats = createEmptyStats();
  saveFreebuffStats(inMemoryStats);
}

function estimatePromptTokens(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  let totalChars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") totalChars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (typeof part?.text === "string") totalChars += part.text.length;
      }
    }
  }
  return Math.max(1, Math.round(totalChars / 3.8) + messages.length * 4);
}

function recordRequestUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  reasoningTokens: number,
  toolCalls: number
): void {
  const stats = loadFreebuffStats();
  const normalizedModel = MODEL_ALIASES[model] || model;
  const pricing = MODEL_PRICING[normalizedModel] || MODEL_PRICING[model] || MODEL_PRICING.default;

  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = ((completionTokens + reasoningTokens) / 1_000_000) * pricing.completion;
  const savedUsd = promptCost + completionCost;

  stats.totalRequests += 1;
  stats.totalPromptTokens += promptTokens;
  stats.totalCompletionTokens += completionTokens;
  stats.totalReasoningTokens += reasoningTokens;
  stats.totalToolCalls += toolCalls;
  stats.totalSavedUsd += savedUsd;
  stats.lastUsedAt = Date.now();

  if (!stats.byModel[normalizedModel]) {
    stats.byModel[normalizedModel] = {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      toolCalls: 0,
      savedUsd: 0,
    };
  }

  const mStats = stats.byModel[normalizedModel];
  mStats.requests += 1;
  mStats.promptTokens += promptTokens;
  mStats.completionTokens += completionTokens;
  mStats.reasoningTokens += reasoningTokens;
  mStats.toolCalls += toolCalls;
  mStats.savedUsd += savedUsd;

  saveFreebuffStats(stats);
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatStatsSummary(): string {
  const stats = loadFreebuffStats();
  const usd = stats.totalSavedUsd;
  const thb = (usd * 34.0).toFixed(1);
  const totalTokens = stats.totalPromptTokens + stats.totalCompletionTokens + stats.totalReasoningTokens;

  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════════════╗");
  lines.push("║              📊 Freebuff Token & Cost Savings Analytics              ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════╝");
  lines.push(` 💰 Estimated API Cost Saved : $${usd.toFixed(2)} USD (~฿${thb} THB)`);
  lines.push(` ⚡ Total Requests Served    : ${stats.totalRequests} requests`);
  lines.push(` 🔤 Total Tokens Processed   : ${formatTokenCount(totalTokens)} (${totalTokens.toLocaleString()} tokens)`);
  lines.push(`    ├─ Prompt / Input Tokens : ${formatTokenCount(stats.totalPromptTokens)} (${stats.totalPromptTokens.toLocaleString()})`);
  lines.push(`    ├─ Completion / Output   : ${formatTokenCount(stats.totalCompletionTokens)} (${stats.totalCompletionTokens.toLocaleString()})`);
  if (stats.totalReasoningTokens > 0) {
    lines.push(`    └─ Reasoning / Thinking  : ${formatTokenCount(stats.totalReasoningTokens)} (${stats.totalReasoningTokens.toLocaleString()})`);
  }
  lines.push(` 🛠️  Tool Calls Synthesized   : ${stats.totalToolCalls} calls`);

  const models = Object.keys(stats.byModel).sort(
    (a, b) => stats.byModel[b].savedUsd - stats.byModel[a].savedUsd
  );

  if (models.length > 0) {
    lines.push("");
    lines.push(" 📈 Usage Breakdown by Model:");
    for (const m of models) {
      const ms = stats.byModel[m];
      const mTotal = ms.promptTokens + ms.completionTokens + ms.reasoningTokens;
      const mName = prettyModelName(m);
      lines.push(
        `  • ${mName.padEnd(20)} : ${ms.requests} reqs | ${formatTokenCount(mTotal)} tokens | Saved $${ms.savedUsd.toFixed(2)}`
      );
    }
  }

  const startDate = new Date(stats.firstUsedAt).toLocaleString();
  lines.push("");
  lines.push(` Active Tracking since: ${startDate}`);
  lines.push(" Run '/freebuff stats reset' to clear recorded metrics.");

  return lines.join("\n");
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
    setUserExplicitlyStopped(true);
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
      setLastUsedModel(active.model);
      setUserExplicitlyStopped(false);
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
    setLastUsedModel(this.currentSession.model);
    setUserExplicitlyStopped(false);

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
      setLastUsedModel(active.model);
      return active.instanceId;
    }

    const anyActive = this.getActiveSession();
    if (anyActive && anyActive.instanceId) {
      const mins = Math.ceil((anyActive.expiresAt - Date.now()) / 60000);
      throw new Error(
        `Active session is locked to ${prettyModelName(anyActive.model)} (${mins}m remaining). Switch to ${anyActive.model} in pi (/model) or run '/freebuff' to start a session for ${prettyModelName(targetModel)}.`
      );
    }

    if (isAutoSessionEnabled()) {
      setUserExplicitlyStopped(false);
      console.log(
        `[Freebuff Auto-Session] No active session for ${prettyModelName(targetModel)}. Auto-renting 1-hour session...`
      );
      const res = await this.startSession(targetModel);
      if (res.ok && res.instanceId) {
        setLastUsedModel(targetModel);
        return res.instanceId;
      }
      throw new Error(
        `Auto-Session failed to rent ${prettyModelName(targetModel)}: ${res.message}`
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

  async fetchSessionInfo(): Promise<SessionCache | null> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "User-Agent": USER_AGENT,
      };
      if (this.currentSession?.instanceId) {
        headers["x-freebuff-instance-id"] = this.currentSession.instanceId;
      }
      const res = await safeFetch(`${CODEBUFF_API_URL}/api/v1/freebuff/session`, {
        method: "GET",
        headers,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        if (data?.status === "active" && (data.instanceId || data.instance_id)) {
          const now = Date.now();
          const expiresAt = data.expiresAt ? Date.parse(data.expiresAt) : now + 3600000;
          this.currentSession = {
            instanceId: data.instanceId || data.instance_id,
            model: data.model || this.currentSession?.model || "deepseek/deepseek-v4-flash",
            expiresAt,
            status: "active",
            freebucks: data.freebucks || undefined,
            rateLimitsByModel: data.rateLimitsByModel || undefined,
            rateLimit: data.rateLimit,
            countryCode: data.countryCode || undefined,
            countryBlockReason: data.countryBlockReason || undefined,
          };
          saveSessionDisk(this.token, this.currentSession);
        } else if (data?.freebucks && this.currentSession) {
          this.currentSession.freebucks = data.freebucks;
          saveSessionDisk(this.token, this.currentSession);
        }
      }
    } catch {}
    return this.currentSession;
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

  async getDetailedPoolStatus() {
    const now = Date.now();
    await Promise.allSettled(this.pool.map((p) => p.client.fetchSessionInfo()));

    return this.pool.map((p, idx) => {
      const session = p.client.getSessionCache();
      const fb = session?.freebucks;
      const balance = typeof fb?.balance === "number" ? fb.balance : null;
      const dailyRemaining =
        typeof fb?.daily?.remaining === "number" ? fb.daily.remaining : null;
      const dailyLimit =
        typeof fb?.daily?.limit === "number"
          ? fb.daily.limit
          : typeof fb?.daily?.granted === "number"
          ? fb.daily.granted
          : null;

      const hasActive = Boolean(
        session && session.instanceId && session.expiresAt > now + 15000
      );
      const remainingMins = hasActive
        ? Math.max(0, Math.ceil((session!.expiresAt - now) / 60000))
        : 0;

      return {
        index: idx,
        name: p.name,
        token: p.token,
        maskedToken: p.token.slice(0, 6) + "..." + p.token.slice(-4),
        isActive: idx === this.activeIndex,
        isBanned: p.isBanned,
        inCooldown: p.cooldownUntil > now,
        cooldownMinutes:
          p.cooldownUntil > now ? Math.ceil((p.cooldownUntil - now) / 60000) : 0,
        requests: p.requestCount,
        balance,
        dailyRemaining,
        dailyLimit,
        activeModel: hasActive ? prettyModelName(session!.model) : null,
        remainingMins,
        countryCode: session?.countryCode,
        countryBlockReason: session?.countryBlockReason,
      };
    });
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

          // Capture all available tool names from client before removing tools
          const availableToolNames = new Set<string>(KNOWN_BUILTIN_TOOLS);
          if (Array.isArray(payload.tools)) {
            for (const t of payload.tools) {
              const name = t?.function?.name || t?.name;
              if (typeof name === "string" && name.trim()) {
                availableToolNames.add(name.trim());
              }
            }
          }

          const requestedModel = payload.model || "deepseek/deepseek-v4-flash-0731";
          const upstreamModel = MODEL_ALIASES[requestedModel] || requestedModel;
          const agentId = AGENT_MAP[requestedModel] || AGENT_MAP[upstreamModel] || "base3-free-deepseek-flash";

          // Translate and enforce tool_choice directive
          let toolChoiceDirective = "";
          if (payload.tool_choice) {
            if (payload.tool_choice === "required") {
              toolChoiceDirective = `\n# CRITICAL MANDATE: TOOL CALL REQUIRED\nYou MUST invoke at least one tool in this turn using the tool calling XML format. It is strictly forbidden to answer with text only without calling a tool.`;
            } else if (payload.tool_choice === "none") {
              toolChoiceDirective = `\n# CRITICAL MANDATE: NO TOOLS\nYou MUST NOT call any tools in this turn. Respond with plain text only. Do NOT output any XML tool tags.`;
            } else if (typeof payload.tool_choice === "object" && payload.tool_choice.function?.name) {
              const forcedTool = payload.tool_choice.function.name;
              toolChoiceDirective = `\n# CRITICAL MANDATE: FORCED TOOL EXECUTION\nYou MUST invoke the specific tool \`${forcedTool}\` in this turn using its XML format. Do NOT skip calling this tool.`;
            } else if (typeof payload.tool_choice === "string" && payload.tool_choice !== "auto") {
              toolChoiceDirective = `\n# CRITICAL MANDATE: FORCED TOOL EXECUTION\nYou MUST invoke the tool \`${payload.tool_choice}\` in this turn.`;
            }
          }

          // Inject Buffy system marker and tool documentation
          const marker = getBuffyMarker(upstreamModel);
          const toolsPrompt = formatToolsForSystemPrompt(payload.tools);
          let fullMarker = toolsPrompt ? `${marker}\n\n${toolsPrompt}` : marker;
          if (toolChoiceDirective) {
            fullMarker = `${fullMarker}\n\n${toolChoiceDirective}`;
          }
          let messages = Array.isArray(payload.messages) ? payload.messages : [];
          if (messages.length > 0 && messages[0].role === "system") {
            messages[0].content = `${fullMarker}\n\n${messages[0].content}`;
          } else {
            messages.unshift({ role: "system", content: fullMarker });
          }
          // Normalize messages for upstream: reconstruct tool calls into assistant XML and convert role: "tool" to user results
          messages = normalizeMessagesForUpstream(messages);
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

          const estimatedPromptTokens = estimatePromptTokens(payload.messages);

          if (!isStream) {
            const data = (await upstreamRes.json()) as any;
            const choice = data.choices?.[0];
            const toolRegex = buildToolStartRegex(availableToolNames);
            if (choice?.message?.content && toolRegex.test(choice.message.content)) {
              const { cleanText, toolCalls } = extractToolCallsFromText(
                choice.message.content,
                availableToolNames
              );
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

            // Record Token & Cost Analytics for non-streaming request
            try {
              const promptTokens = data.usage?.prompt_tokens ?? estimatedPromptTokens;
              const completionTokens =
                data.usage?.completion_tokens ??
                Math.max(1, Math.round((choice?.message?.content?.length || 0) / 3.8));
              const reasoningTokens =
                data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
              const toolCallsCount = Array.isArray(choice?.message?.tool_calls)
                ? choice.message.tool_calls.length
                : 0;
              recordRequestUsage(
                requestedModel,
                promptTokens,
                completionTokens,
                reasoningTokens,
                toolCallsCount
              );
            } catch {}
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
            requestedModel,
            availableToolNames
          );

          let upstreamUsage: any = null;
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
                    if (parsed.usage) {
                      upstreamUsage = parsed.usage;
                    }
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta?.reasoning_content) {
                      transformer.feedReasoning(delta.reasoning_content);
                    }
                    if (delta?.content) {
                      transformer.feedText(delta.content);
                    }
                    if (delta?.tool_calls) {
                      transformer.feedNativeToolCalls(delta.tool_calls);
                    }
                  } catch {}
                }
              }
            } finally {
              transformer.finish();
              res.end();
              await cleanup();

              // Record Token & Cost Analytics for streaming request
              try {
                const metrics = transformer.getMetrics();
                const promptTokens = upstreamUsage?.prompt_tokens ?? estimatedPromptTokens;
                const completionTokens =
                  upstreamUsage?.completion_tokens ??
                  Math.max(1, Math.round(metrics.completionChars / 3.8));
                const reasoningTokens =
                  upstreamUsage?.completion_tokens_details?.reasoning_tokens ??
                  Math.round(metrics.reasoningChars / 3.8);
                const toolCallsCount = metrics.toolCallsCount;
                recordRequestUsage(
                  requestedModel,
                  promptTokens,
                  completionTokens,
                  reasoningTokens,
                  toolCallsCount
                );
              } catch {}
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

async function checkAndAutoRenewSession(pool: TokenPool): Promise<void> {
  if (!isAutoSessionEnabled()) return;
  if (isUserExplicitlyStopped()) return;

  const entry = pool.peekActive();
  if (!entry) return;

  const client = entry.client;
  const activeSession = client.getActiveSession();
  if (activeSession && activeSession.instanceId) {
    if (activeSession.model) {
      setLastUsedModel(activeSession.model);
    }
    return;
  }

  // Session has expired or is null!
  const now = Date.now();
  if (now - lastAutoRentAttemptTime < 60_000) {
    return; // Cooldown 60s
  }

  const modelToRent = getLastUsedModel() || pool.getLastRequestedModel();
  if (!modelToRent) return;

  lastAutoRentAttemptTime = now;
  console.log(
    `[Freebuff Auto-Session] Active session expired. Automatically renewing 1-hour session for ${prettyModelName(modelToRent)}...`
  );

  try {
    const res = await client.startSession(modelToRent);
    if (res.ok) {
      setLastUsedModel(modelToRent);
      console.log(
        `[Freebuff Auto-Session] Successfully renewed 1-hour session for ${prettyModelName(modelToRent)}!`
      );
    } else {
      console.warn(
        `[Freebuff Auto-Session] Auto-renewal failed: ${res.message}`
      );
    }
  } catch (err: any) {
    console.warn(`[Freebuff Auto-Session] Error during auto-renewal: ${err?.message || err}`);
  }
}

  // Keep-alive heartbeat: the official desktop client pings its active
  // session every ~45s (GET /freebuff/session + x-freebuff-heartbeat) to
  // prevent mid-conversation expiry. Also runs auto-session renewal if enabled.
  const HEARTBEAT_INTERVAL_MS = 45_000;
  const heartbeatTimer = setInterval(async () => {
    try {
      const entry = pool.peekActive();
      await entry?.client.heartbeat();
      await checkAndAutoRenewSession(pool);
    } catch {}
  }, HEARTBEAT_INTERVAL_MS);
  // Don't keep the process alive just for the heartbeat (Node only)
  if (typeof (heartbeatTimer as any)?.unref === "function") {
    (heartbeatTimer as any).unref();
  }

  // Initial check shortly after startup if autoSession is enabled
  setTimeout(() => {
    checkAndAutoRenewSession(pool).catch(() => {});
  }, 4000);

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
            `Rent ${prettyModelName(targetModel)} for 1 hour? Cost: ${price} Freebucks.`
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
          setUserExplicitlyStopped(true);
          await activeClient.deleteSession();
          ctx.ui.notify("Active cloud session released successfully.", "info");
        } else {
          ctx.ui.notify("No active account found.", "warning");
        }
        return;
      }

      // 3. Subcommand: /freebuff auto-session [on/off]
      if (sub === "auto-session" || sub === "autosession" || sub === "auto") {
        const action = parts[1]?.toLowerCase();
        let newState: boolean;
        if (["on", "enable", "true", "1"].includes(action)) {
          newState = true;
        } else if (["off", "disable", "false", "0"].includes(action)) {
          newState = false;
        } else {
          newState = !isAutoSessionEnabled();
        }

        setAutoSessionEnabled(newState);
        if (newState) {
          setUserExplicitlyStopped(false);
          const lastMdl = getLastUsedModel() || activeClient?.getActiveSession()?.model || "current model";
          ctx.ui.notify(
            `Auto-Sessions ENABLED: Freebuff will automatically re-rent a 1-hour session for ${prettyModelName(lastMdl)} when the session expires.`,
            "info"
          );
        } else {
          ctx.ui.notify(
            "Auto-Sessions DISABLED: Session rental is now manual via /freebuff.",
            "info"
          );
        }
        return;
      }

      // 4. Subcommand: /freebuff add <token>
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

      // 5. Subcommand: /freebuff login
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

      // 6. Subcommand: /freebuff rotate
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

      // 7. Subcommand: /freebuff stats [reset]
      if (sub === "stats" || sub === "usage") {
        const action = parts[1]?.toLowerCase();
        if (action === "reset" || action === "clear") {
          resetFreebuffStats();
          ctx.ui.notify("Freebuff token metrics and cost savings have been reset.", "info");
          return;
        }
        ctx.ui.notify(formatStatsSummary(), "info");
        return;
      }

      // 8. Subcommand: /freebuff help
      if (sub === "help") {
        const helpText = [
          "Freebuff Commands Guide:",
          "/freebuff                 - Open interactive dashboard & session manager",
          "/freebuff start           - Open model picker to rent a 1-hour session",
          "/freebuff start <mdl>     - Rent 1-hour session (e.g. glm, 0731, solar)",
          "/freebuff auto-session    - Toggle auto-renewal of expired sessions",
          "/freebuff auto-session on - Enable auto-renewal using last-used model",
          "/freebuff auto-session off- Disable auto-renewal (manual rental only)",
          "/freebuff stop            - Release current cloud session",
          "/freebuff stats           - View total tokens processed & estimated USD/THB savings",
          "/freebuff stats reset     - Reset recorded token and cost statistics",
          "/freebuff status          - View accounts, Freebucks balance & countdown",
          "/freebuff login           - Open login link & prompt to paste token",
          "/freebuff add <token>     - Add an auth token to the account pool",
          "/freebuff rotate          - Switch to next standby account",
          "/model                    - Open pi native model selector",
        ].join("\n");
        ctx.ui.notify(helpText, "info");
        return;
      }

      // 7. Default: account dashboard + interactive menu
      const accounts = await pool.getDetailedPoolStatus();
      const activeAcc = accounts.find((a) => a.isActive);
      const hasActive = Boolean(activeAcc?.activeModel);
      const remainingMins = activeAcc?.remainingMins ?? 0;
      const session = activeClient?.getSessionCache();

      const divider = "─".repeat(50);
      const accountCards = accounts
        .map((a) => {
          const tag = a.isBanned
            ? "[BANNED  ]"
            : a.inCooldown
            ? `[COOLDOWN ${a.cooldownMinutes}m]`
            : a.isActive
            ? "[ACTIVE  ]"
            : "[STANDBY ]";
          const coins = a.balance !== null ? `${a.balance}` : "?";
          const daily =
            a.dailyRemaining !== null && a.dailyLimit !== null
              ? `Daily: ${a.dailyRemaining}/${a.dailyLimit}`
              : "Daily: ?";
          const sessionLine = a.activeModel
            ? `${a.activeModel} (${a.remainingMins}m left)`
            : "None (Idle)";
          const autoLine = isAutoSessionEnabled()
            ? `Auto-Session: ENABLED (renews ${prettyModelName(getLastUsedModel() || a.activeModel || "last model")})`
            : "Auto-Session: DISABLED (manual)";
          const lines = [
            `${tag}  ${a.name}  (${a.maskedToken})`,
            `           Freebucks : ${coins} coins  |  ${daily}`,
            `           Session   : ${sessionLine}`,
            `           Policy    : ${autoLine}`,
            `           Traffic   : ${a.requests} request(s) served`,
          ];
          if (a.countryBlockReason) {
            lines.push(`           ! ${a.countryCode ?? ""}:  ${a.countryBlockReason}`);
          }
          return lines.join("\n");
        })
        .join("\n\n");

      const headerLine = hasActive
        ? `  Active: ${prettyModelName(activeAcc!.activeModel!)}  |  ${remainingMins}m remaining`
        : "  No Active Session  |  Select an action below:";

      const stats = loadFreebuffStats();
      const totalTokens = stats.totalPromptTokens + stats.totalCompletionTokens + stats.totalReasoningTokens;
      const statsSummaryLine = `  💰 Savings: $${stats.totalSavedUsd.toFixed(2)} USD (~฿${(stats.totalSavedUsd * 34).toFixed(0)}) | ⚡ ${formatTokenCount(totalTokens)} Tokens (${stats.totalRequests} reqs)`;

      const dashboardTitle = [
        divider,
        "  FREEBUFF ACCOUNT DASHBOARD",
        statsSummaryLine,
        divider,
        accountCards,
        divider,
        headerLine,
      ].join("\n");

      if (ctx.hasUI) {
        const menuOptions: string[] = [];
        if (hasActive) {
          menuOptions.push(
            `[Active] ${prettyModelName(activeAcc!.activeModel!)} (${remainingMins}m left)`
          );
          menuOptions.push("[Switch] Rent Different Model (New 1-Hour Session)");
          menuOptions.push("[End] Release Active Session");
        } else {
          menuOptions.push("[Start] Rent 1-Hour Session (Select Model)");
        }
        if (accounts.length > 1) {
          menuOptions.push("[Rotate] Switch to Next Standby Account");
        }
        const autoLabel = isAutoSessionEnabled()
          ? "[Auto-Session] Toggle OFF (Currently: ENABLED)"
          : "[Auto-Session] Toggle ON (Currently: DISABLED)";
        menuOptions.push(autoLabel);
        menuOptions.push("[Stats] View Token Usage & Cost Savings");
        menuOptions.push("[Status] Show Dashboard in Notification");
        menuOptions.push("[Token] Add Auth Token / Login");
        menuOptions.push("Close");

        const choice = await ctx.ui.select(dashboardTitle, menuOptions);

        if (choice && (choice.startsWith("[Start]") || choice.startsWith("[Switch]"))) {
          const balance = session?.freebucks?.balance ?? "?";
          const modelOptions = availableModels.map((m) => {
            const price = getModelPrice(session ?? null, m);
            const priceText = price !== null ? `${price} Freebucks/hr` : "Standard";
            return `${prettyModelName(m)} (${priceText}) -> ${m}`;
          });
          const picked = await ctx.ui.select(
            `Select Model to Rent for 1 Hour (Balance: ${balance}):`,
            [...modelOptions, "Cancel"]
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
        } else if (choice && choice.startsWith("[End]")) {
          if (activeClient) {
            setUserExplicitlyStopped(true);
            await activeClient.deleteSession();
            ctx.ui.notify("Active session released successfully.", "info");
          }
        } else if (choice && choice.startsWith("[Auto-Session]")) {
          const next = !isAutoSessionEnabled();
          setAutoSessionEnabled(next);
          if (next) {
            setUserExplicitlyStopped(false);
            const lastMdl = getLastUsedModel() || activeAcc?.activeModel || "current model";
            ctx.ui.notify(
              `Auto-Sessions ENABLED: Freebuff will automatically re-rent a 1-hour session for ${prettyModelName(lastMdl)} when expired.`,
              "info"
            );
          } else {
            ctx.ui.notify(
              "Auto-Sessions DISABLED: Session rental is now manual.",
              "info"
            );
          }
        } else if (choice && choice.startsWith("[Rotate]")) {
          const rotated = pool.rotateNext(true);
          const newActive = pool.getPoolStatus().find((p) => p.isActive);
          ctx.ui.notify(
            rotated
              ? `Switched active account to: ${newActive?.name}`
              : "Could not rotate to another account.",
            "info"
          );
        } else if (choice && choice.startsWith("[Stats]")) {
          ctx.ui.notify(formatStatsSummary(), "info");
        } else if (choice && choice.startsWith("[Status]")) {
          ctx.ui.notify(dashboardTitle, "info");
        } else if (choice && choice.startsWith("[Token]")) {
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
        ctx.ui.notify(dashboardTitle, "info");
      }
    },
  });
}
