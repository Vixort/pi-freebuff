#!/usr/bin/env node
/**
 * pi-freebuff — Safe Upstream Protocol Test
 *
 * Validates the freebucks (coin) session protocol with REAL tokens but with
 * maximum safety against account flags:
 *   - Minimal request count (2 session handshakes + 1 zero-cost chat + teardown)
 *   - Humanized delays between every upstream call (350ms+ jitter, seconds between phases)
 *   - Tokens are NEVER printed in full (masked prefix...suffix everywhere)
 *   - Zero-cost model used for the chat test (upstage/solar-pro4)
 *   - Clean DELETE teardown for every session created (no ghost sessions -> no 409)
 *
 * Usage: node scripts/protocol-test.mjs
 */

import fs from "node:fs";
import os from "node:os";

const BASE = "https://www.codebuff.com";
const UA = "ai-sdk/openai-compatible/1.0.25/codebuff";
const ZERO_COST_MODEL = "upstage/solar-pro4";
const ZERO_COST_AGENT = "base3-free-solar-pro4";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.floor(Math.random() * (max - min)));

const mask = (t) => (t.length > 10 ? t.slice(0, 4) + "..." + t.slice(-4) : "***");
const redact = (obj) =>
  JSON.stringify(
    obj,
    (key, value) => {
      if (
        typeof value === "string" &&
        /instanceId|instance_id|runId|run_id/i.test(key) &&
        value.length > 12
      ) {
        return value.slice(0, 8) + "...[redacted]";
      }
      return value;
    },
    2
  );

function loadTokens() {
  const credPath = os.homedir() + "/.config/manicode/credentials.json";
  if (!fs.existsSync(credPath)) {
    console.error("No credentials.json found at", credPath);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(credPath, "utf8"));
  const tokens = [];
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (v && typeof v === "object" && v.authToken) {
      tokens.push({ name: key, token: String(v.authToken).trim() });
    }
  }
  return tokens;
}

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": UA,
    ...extra,
  };
}

async function createSession(token, model, { multiSession = false } = {}) {
  const extra = {
    "Content-Type": "application/json",
    "x-freebuff-model": model,
  };
  if (multiSession) extra["x-freebuff-multi-session"] = "1";
  const res = await fetch(`${BASE}/api/v1/freebuff/session`, {
    method: "POST",
    headers: headers(token, extra),
    body: "{}",
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

async function getSession(token) {
  const res = await fetch(`${BASE}/api/v1/freebuff/session`, {
    method: "GET",
    headers: headers(token, {
      "x-freebuff-multi-session": "1",
      "x-freebuff-include-unused-rate-limits": "1",
    }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

async function deleteSession(token, instanceId) {
  const res = await fetch(`${BASE}/api/v1/freebuff/session`, {
    method: "DELETE",
    headers: headers(token, {
      "x-freebuff-instance-id": instanceId,
      "x-freebuff-multi-session": "1",
    }),
  });
  return res.status;
}

async function startRun(token, agentId) {
  const res = await fetch(`${BASE}/api/v1/agent-runs`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "START", agentId, ancestorRunIds: [] }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

async function finishRun(token, runId) {
  try {
    await fetch(`${BASE}/api/v1/agent-runs`, {
      method: "POST",
      headers: headers(token, { "Content-Type": "application/json" }),
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

async function chatCompletion(token, model, instanceId, runId, { withHeader = false } = {}) {
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are Buffy, the coding agent behind Codebuff. Answer with exactly one word: OK",
      },
      { role: "user", content: "Reply with OK" },
    ],
    stream: false,
    max_tokens: 32,
    codebuff_metadata: {
      run_id: runId,
      cost_mode: "free",
      client_id: Math.random().toString(36).slice(2, 15),
      freebuff_instance_id: instanceId,
    },
  };
  const chatHeaders = headers(token, { "Content-Type": "application/json", Accept: "application/json" });
  if (withHeader) chatHeaders["x-freebuff-instance-id"] = instanceId;
  const res = await fetch(`${BASE}/api/v1/chat/completions`, {
    method: "POST",
    headers: chatHeaders,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("=== pi-freebuff safe protocol test ===");
  console.log("(tokens are masked; instance/run IDs are redacted in output)\n");

  const tokens = loadTokens();
  if (tokens.length === 0) {
    console.error("No tokens found in credentials.json");
    process.exit(1);
  }
  console.log(
    "Tokens loaded:",
    tokens.map((t) => `${t.name}[${mask(t.token)}]`).join(", ")
  );

  const created = []; // { name, token, instanceId }
  const MULTI = process.env.TEST_MULTI === "1"; // A/B: multi-session header on/off

  // ---------- Phase 1: session handshake per token ----------
  for (const t of tokens) {
    console.log(`\n--- [${t.name}] POST /freebuff/session (model: ${ZERO_COST_MODEL}${MULTI ? ", multi-session" : ""}) ---`);
    try {
      const { status, data, text } = await createSession(t.token, ZERO_COST_MODEL, { multiSession: MULTI });
      console.log("HTTP", status);
      if (data) {
        const iid = data.instanceId || data.instance_id;
        // Full dump only in DEBUG mode; otherwise print the freebucks essentials
        if (process.env.DEBUG_FREEBUFF) {
          console.log(redact(data));
        } else {
          const fb = data.freebucks;
          console.log(
            "status:", data.status,
            "| tier:", data.accessTier,
            "| instance:", iid ? mask(iid) : "(none)"
          );
          if (fb) {
            console.log(
              `freebucks: balance=${fb.balance} daily.remaining=${fb.daily?.remaining}/${fb.daily?.limit}`
            );
            console.log("prices:", JSON.stringify(fb.prices));
          }
          if (data.countryBlockReason) console.log("countryBlockReason:", data.countryBlockReason);
        }
        if (iid) created.push({ name: t.name, token: t.token, instanceId: iid });
      } else {
        console.log("non-JSON body:", text.slice(0, 300));
      }
    } catch (e) {
      console.log("network error:", e.message);
    }
    await jitter(1800, 3200); // human-like pause between accounts
  }

  const primary = created[0];

  // Phase 2 (GET state) is SKIPPED by default: an unauthenticated GET between
  // POST-session and chat may confuse the server's current-session pointer.
  if (process.env.RUN_GET_PHASE === "1" && primary) {
    console.log(`\n--- [${primary.name}] GET /freebuff/session (include-unused) ---`);
    try {
      const { status, data, text } = await getSession(primary.token);
      console.log("HTTP", status);
      if (data) console.log(redact(data));
      else console.log("non-JSON body:", text.slice(0, 300));
    } catch (e) {
      console.log("network error:", e.message);
    }
    await jitter(1200, 2200);
  }

  // ---------- Phase 3: single zero-cost end-to-end chat ----------
  if (primary) {
    console.log(
      `\n--- [${primary.name}] E2E chat test (model: ${ZERO_COST_MODEL}, 0 coins, 1 request) ---`
    );
    try {
      const run = await startRun(primary.token, ZERO_COST_AGENT);
      console.log("START /agent-runs -> HTTP", run.status, run.data ? "(runId received)" : run.text.slice(0, 200));

      if (run.status === 200 && run.data) {
        await jitter(600, 1100);
        const chat = await chatCompletion(
          primary.token,
          ZERO_COST_MODEL,
          primary.instanceId,
          run.data.runId || run.data.run_id,
          { withHeader: process.env.CHAT_INSTANCE_HEADER === "1" }
        );
        console.log("POST /chat/completions -> HTTP", chat.status);
        if (chat.status >= 400) {
          console.log("error body:", chat.text.slice(0, 600));
        } else if (chat.data) {
          const content = chat.data.choices?.[0]?.message?.content;
          console.log("assistant:", JSON.stringify(content)?.slice(0, 200));
          if (chat.data.usage) console.log("usage:", JSON.stringify(chat.data.usage));
        } else {
          console.log("body:", chat.text.slice(0, 400));
        }
        await jitter(600, 1100);
        await finishRun(primary.token, run.data.runId || run.data.run_id);
        console.log("FINISH /agent-runs sent");
      }
    } catch (e) {
      console.log("network error:", e.message);
    }
    await jitter(1500, 2500);
  } else {
    console.log("\n(no active session — skipping chat test)");
  }

  // ---------- Phase 4: teardown every created session ----------
  console.log("\n--- teardown: DELETE sessions ---");
  for (const s of created) {
    try {
      const st = await deleteSession(s.token, s.instanceId);
      console.log(`[${s.name}] DELETE -> HTTP ${st}`);
    } catch (e) {
      console.log(`[${s.name}] DELETE error:`, e.message);
    }
    await jitter(400, 900);
  }

  console.log("\n=== done — all sessions released ===");
}

main();
