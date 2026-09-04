#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");
const readline = require("node:readline");

const DIR = __dirname;
const CREDS_FILE = path.join(os.homedir(), ".config", "manicode", "credentials.json");

// ANSI color helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[0f");
  }
}

function printBanner() {
  console.log(`${c.cyan}${c.bold}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}${c.bold}║              pi-freebuff Manager & Updater                 ║${c.reset}`);
  console.log(`${c.cyan}${c.bold}╚════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(` ${c.dim}Platform:${c.reset} ${os.platform()} (${os.arch()})  ${c.dim}| Config:${c.reset} ${CREDS_FILE}\n`);
}

function promptText(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function pause() {
  return promptText(`\n${c.dim}Press Enter to continue...${c.reset}`);
}

// -------------------------------------------------------------
// Core Actions
// -------------------------------------------------------------

function getTokens() {
  if (!fs.existsSync(CREDS_FILE)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
    const entries = [];
    if (Array.isArray(d.tokens)) {
      d.tokens.forEach((t, i) => entries.push({ key: `token_${i + 1}`, token: String(t).trim() }));
    }
    for (const k of Object.keys(d)) {
      if (d[k]?.authToken) entries.push({ key: k, token: String(d[k].authToken).trim() });
    }
    return entries;
  } catch {
    return [];
  }
}

function saveToken(token, isAdd = false) {
  fs.mkdirSync(path.dirname(CREDS_FILE), { recursive: true });
  let data = {};
  if (fs.existsSync(CREDS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
    } catch {}
  }

  let key = "default";
  if (isAdd) {
    if (!data.default || !data.default.authToken) {
      key = "default";
    } else {
      let count = 2;
      while (data[`account_${count}`]) count++;
      key = `account_${count}`;
    }
  }

  if (!data[key]) data[key] = {};
  data[key].authToken = token.trim();
  fs.writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return key;
}

function actionGitPull() {
  console.log(`${c.yellow}>> Pulling latest code from git...${c.reset}`);
  try {
    const out = execSync("git pull --ff-only", { cwd: DIR, encoding: "utf8" });
    console.log(`${c.green}${out.trim() || "Already up to date."}${c.reset}`);
  } catch (err) {
    console.log(`${c.red}Git pull failed or no remote configured: ${err.message}${c.reset}`);
  }
}

function actionListTokens() {
  console.log(`${c.bold}>> Configured Accounts in Token Pool:${c.reset}`);
  const tokens = getTokens();
  if (tokens.length === 0) {
    console.log(`   ${c.yellow}(No tokens found in credentials file)${c.reset}`);
    console.log(`   ${c.dim}Get one from: https://freebuff.llm.pm${c.reset}`);
  } else {
    tokens.forEach((item, idx) => {
      const masked = item.token.slice(0, 8) + "..." + item.token.slice(-4);
      console.log(`   [${idx + 1}] ${c.cyan}${item.key}${c.reset}: ${masked}`);
    });
  }
}

async function actionAddToken() {
  console.log(`${c.bold}>> Add New Token to Pool${c.reset}`);
  console.log(`   ${c.dim}Login at https://freebuff.llm.pm to get a token.${c.reset}`);
  const input = await promptText(`Enter token to add: `);
  if (!input) {
    console.log(`${c.dim}Cancelled.${c.reset}`);
    return;
  }
  const savedKey = saveToken(input, true);
  console.log(`${c.green}>> Successfully added token as [${savedKey}]!${c.reset}`);
}

async function actionSetPrimaryToken() {
  console.log(`${c.bold}>> Set / Replace Primary Token (Account 1)${c.reset}`);
  console.log(`   ${c.dim}Login at https://freebuff.llm.pm to get a token.${c.reset}`);
  const input = await promptText(`Enter new primary token: `);
  if (!input) {
    console.log(`${c.dim}Cancelled.${c.reset}`);
    return;
  }
  saveToken(input, false);
  console.log(`${c.green}>> Primary token updated successfully!${c.reset}`);
}

function actionVerifyPi() {
  console.log(`${c.yellow}>> Verifying with pi CLI...${c.reset}`);
  try {
    execSync(`pi install "${DIR}"`, { stdio: "ignore" });
    const modelsOut = execSync("pi --list-models", { encoding: "utf8" });
    const freebuffModels = modelsOut
      .split("\n")
      .filter((l) => l.toLowerCase().includes("freebuff"));

    if (freebuffModels.length > 0) {
      console.log(`${c.green}>> Freebuff provider registered successfully in pi!${c.reset}`);
      console.log(`${c.bold}Available Models:${c.reset}`);
      freebuffModels.forEach((m) => console.log("   " + m));
    } else {
      console.log(`${c.yellow}>> pi CLI found, but Freebuff models did not appear in list.${c.reset}`);
    }
  } catch (err) {
    console.log(`${c.red}>> Could not verify with pi: ${err.message}${c.reset}`);
  }
}

async function actionFullAutoUpdate() {
  console.log(`${c.bold}>> Starting Full Auto-Update...${c.reset}\n`);
  actionGitPull();
  console.log();
  actionListTokens();
  console.log();
  actionVerifyPi();
  console.log(`\n${c.green}>> Auto-update completed! Tip: Type /reload inside pi CLI.${c.reset}`);
}

async function actionClearStaleSessions() {
  console.log(`${c.yellow}${c.bold}>> Clearing / Resetting Stale Cloud Sessions...${c.reset}`);
  const tokens = getTokens();
  if (tokens.length === 0) {
    console.log(`   ${c.yellow}(No tokens found to clear)${c.reset}`);
    return;
  }

  for (const item of tokens) {
    try {
      const res = await fetch("https://www.codebuff.com/api/v1/freebuff/session", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${item.token}`,
          "User-Agent": "ai-sdk/openai-compatible/1.0.25/codebuff",
        },
        signal: AbortSignal.timeout(4000),
      });
      console.log(
        `   [${item.key}] Reset status: ${res.status} (${
          res.status === 200 ? "Cleaned" : "No active session"
        })`
      );
    } catch (err) {
      console.log(`   [${item.key}] Error: ${err.message}`);
    }
  }
  console.log(`${c.green}>> Done clearing stale sessions!${c.reset}`);
}

async function actionHelpTroubleshooting() {
  console.log(`${c.cyan}${c.bold}══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}${c.bold}            Freebuff Help & Troubleshooting Guide             ${c.reset}`);
  console.log(`${c.cyan}${c.bold}══════════════════════════════════════════════════════════════${c.reset}\n`);

  console.log(`${c.bold}1. How to obtain a new Auth Token:${c.reset}`);
  console.log(`   - Visit: ${c.cyan}https://freebuff.llm.pm${c.reset}`);
  console.log(`   - Sign in with your Freebuff / Google / GitHub account and copy the token`);
  console.log(`   - Add it via option [4] "Add New Token" or run: ./manage.sh add <TOKEN>\n`);

  console.log(`${c.bold}2. Troubleshooting Common Errors:${c.reset}`);
  console.log(`   ${c.yellow}• Error 403 (banned / account unavailable):${c.reset}`);
  console.log(`     - Triggered when upstream detects abnormal/automated request patterns`);
  console.log(`     - Resolution: Add a new standby token from freebuff.llm.pm into the pool`);
  console.log(`   ${c.yellow}• Error 429 (rate_limited):${c.reset}`);
  console.log(`     - Daily free quota exhausted (resets daily at midnight Pacific Time)`);
  console.log(`     - Resolution: Add 1-2 secondary accounts to the pool; auto-rotation handles it`);
  console.log(`   ${c.yellow}• Error 409 (session_superseded / model_locked):${c.reset}`);
  console.log(`     - Upstream cloud session is bound to another model or lingering`);
  console.log(`     - Resolution: Choose menu option [7] "Clear / Reset Stale Cloud Sessions"\n`);

  console.log(`${c.bold}3. Quick Usage in pi CLI:${c.reset}`);
  console.log(`   - In-session menu:    Type ${c.cyan}/freebuff${c.reset}`);
  console.log(`   - Switch model:       Type ${c.cyan}/model${c.reset} and pick under Freebuff (Native)`);
  console.log(`   - Rotate account:     Type ${c.cyan}/freebuff rotate${c.reset}`);
  console.log(`   - Add token in pi:    Type ${c.cyan}/freebuff add <TOKEN>${c.reset}\n`);

  process.stdout.write(`Checking connection to Codebuff servers... `);
  try {
    const start = Date.now();
    const res = await fetch("https://www.codebuff.com/healthz", {
      signal: AbortSignal.timeout(3000),
    });
    const ms = Date.now() - start;
    console.log(`${c.green}Online (${ms}ms, HTTP ${res.status})${c.reset}`);
  } catch (e) {
    console.log(`${c.red}Unreachable (${e.message})${c.reset}`);
  }
}

async function actionUninstallPi() {
  console.log(`${c.red}${c.bold}>> Uninstall / Remove pi-freebuff from pi CLI${c.reset}`);
  const confirm = await promptText(
    `Are you sure you want to remove pi-freebuff from pi CLI? (y/N): `
  );
  if (confirm.toLowerCase() !== "y") {
    console.log(`${c.dim}Cancelled.${c.reset}`);
    return;
  }

  // 1. Remove from pi settings.json
  const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (Array.isArray(data.packages)) {
        const initialCount = data.packages.length;
        data.packages = data.packages.filter(
          (p) => !p.includes("freebufftopi") && !p.includes("pi-freebuff")
        );
        if (data.packages.length < initialCount) {
          fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
          console.log(`${c.green}>> Removed pi-freebuff from ~/.pi/agent/settings.json${c.reset}`);
        }
      }
    } catch (err) {
      console.log(`${c.yellow}>> Could not update settings.json: ${err.message}${c.reset}`);
    }
  }

  try {
    execSync(`pi remove "${DIR}"`, { stdio: "ignore" });
  } catch {}

  // 2. Optional: remove credentials
  const delCreds = await promptText(
    `Also delete stored credentials file (${CREDS_FILE})? (y/N): `
  );
  if (delCreds.toLowerCase() === "y" && fs.existsSync(CREDS_FILE)) {
    try {
      fs.unlinkSync(CREDS_FILE);
      console.log(`${c.green}>> Deleted ${CREDS_FILE}${c.reset}`);
    } catch (err) {
      console.log(`${c.yellow}>> Could not delete credentials file: ${err.message}${c.reset}`);
    }
  }

  console.log(`${c.green}>> Successfully uninstalled pi-freebuff from pi CLI.${c.reset}`);
  console.log(`${c.dim}Tip: Type /reload inside pi CLI if it is running.${c.reset}`);
}

// -------------------------------------------------------------
// Interactive TUI
// -------------------------------------------------------------

const MENU_ITEMS = [
  { label: "Full Auto Update (Git Pull + Verify with pi)", action: actionFullAutoUpdate },
  { label: "Pull Latest Code (git pull)", action: actionGitPull },
  { label: "View Token Pool Status", action: actionListTokens },
  { label: "Add New Token to Pool", action: actionAddToken },
  { label: "Set / Replace Primary Token", action: actionSetPrimaryToken },
  { label: "Verify & List Models in pi CLI", action: actionVerifyPi },
  {
    label: "Clear / Reset Stale Cloud Sessions (Fix 409 errors)",
    action: actionClearStaleSessions,
  },
  {
    label: "Help & Troubleshooting Guide",
    action: actionHelpTroubleshooting,
  },
  {
    label: "Uninstall / Remove pi-freebuff from pi CLI",
    action: actionUninstallPi,
  },
  { label: "Exit", action: null },
];

async function runInteractiveTUI() {
  let selected = 0;

  function renderMenu() {
    clearScreen();
    printBanner();
    console.log(`${c.bold}Select an option:${c.reset}\n`);

    MENU_ITEMS.forEach((item, idx) => {
      if (idx === selected) {
        console.log(`  ${c.cyan}${c.bold}❯ [${idx + 1}] ${item.label}${c.reset}`);
      } else {
        console.log(`    [${idx + 1}] ${item.label}`);
      }
    });

    console.log(`\n${c.dim}Use ↑/↓ arrows and Enter, or type a number (1-${MENU_ITEMS.length})${c.reset}`);
  }

  // Check if raw mode is supported for arrow keys
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    renderMenu();

    return new Promise((resolve) => {
      const onKeypress = async (str, key) => {
        if (!key) return;

        if (key.ctrl && key.name === "c") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          console.log("\nBye!");
          process.exit(0);
        }

        if (key.name === "up") {
          selected = (selected - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          renderMenu();
        } else if (key.name === "down") {
          selected = (selected + 1) % MENU_ITEMS.length;
          renderMenu();
        } else if (key.name === "return") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("keypress", onKeypress);

          const item = MENU_ITEMS[selected];
          if (!item.action) {
            console.log("\nBye!");
            process.exit(0);
          }

          clearScreen();
          printBanner();
          await item.action();
          await pause();
          return runInteractiveTUI();
        } else if (/^[1-9]$/.test(str)) {
          const num = parseInt(str, 10) - 1;
          if (num >= 0 && num < MENU_ITEMS.length) {
            selected = num;
            renderMenu();
          }
        }
      };

      process.stdin.on("keypress", onKeypress);
    });
  } else {
    // Numbered fallback for non-TTY or basic terminals
    clearScreen();
    printBanner();
    MENU_ITEMS.forEach((item, idx) => {
      console.log(`  [${idx + 1}] ${item.label}`);
    });

    const choice = await promptText(`\nEnter choice (1-${MENU_ITEMS.length}): `);
    const num = parseInt(choice, 10) - 1;
    if (num >= 0 && num < MENU_ITEMS.length) {
      const item = MENU_ITEMS[num];
      if (!item.action) {
        process.exit(0);
      }
      clearScreen();
      printBanner();
      await item.action();
      await pause();
      return runInteractiveTUI();
    } else {
      process.exit(0);
    }
  }
}

// -------------------------------------------------------------
// CLI Arguments Mode (Direct / Non-interactive)
// -------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();

  if (cmd === "list") {
    printBanner();
    actionListTokens();
    return;
  }

  if (cmd === "add") {
    printBanner();
    const token = args[1];
    if (token) {
      const key = saveToken(token, true);
      console.log(`${c.green}>> Token added as [${key}]!${c.reset}`);
    } else {
      await actionAddToken();
    }
    return;
  }

  if (cmd === "pull") {
    printBanner();
    actionGitPull();
    return;
  }

  if (cmd === "verify" || cmd === "check") {
    printBanner();
    actionVerifyPi();
    return;
  }

  if (cmd === "uninstall" || cmd === "remove") {
    printBanner();
    await actionUninstallPi();
    return;
  }

  if (cmd === "help") {
    printBanner();
    await actionHelpTroubleshooting();
    return;
  }

  if (cmd === "reset" || cmd === "clear-session") {
    printBanner();
    await actionClearStaleSessions();
    return;
  }

  if (cmd && !cmd.startsWith("-")) {
    // Treat bare argument as a primary token update
    printBanner();
    saveToken(cmd, false);
    console.log(`${c.green}>> Primary token updated successfully!${c.reset}`);
    actionVerifyPi();
    return;
  }

  // Default: Launch TUI
  await runInteractiveTUI();
}

main().catch((err) => {
  console.error(c.red + "Error: " + err.message + c.reset);
  process.exit(1);
});
