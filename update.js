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
