#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect if run under sudo and resolve real user
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  REAL_HOME=$(eval echo "~$SUDO_USER")
  export HOME="$REAL_HOME"
  export PATH="$PATH:$REAL_HOME/.npm-global/bin"
  CREDS_FILE="$REAL_HOME/.config/manicode/credentials.json"
else
  export PATH="$PATH:$HOME/.npm-global/bin"
  CREDS_FILE="$HOME/.config/manicode/credentials.json"
fi

echo "=== pi-freebuff Updater ==="

ACTION="$1"
ARG="$2"

# Subcommand: list
if [ "$ACTION" = "list" ]; then
  echo ">> Configured Freebuff Tokens in $CREDS_FILE:"
  if [ -f "$CREDS_FILE" ]; then
    node -e '
      const fs = require("fs");
      const credPath = process.argv[1];
      try {
        const d = JSON.parse(fs.readFileSync(credPath, "utf8"));
        const entries = [];
        if (Array.isArray(d.tokens)) {
          d.tokens.forEach((t, i) => entries.push({ name: "token_" + (i+1), token: t }));
        }
        for (const k of Object.keys(d)) {
          if (d[k]?.authToken) entries.push({ name: k, token: d[k].authToken });
        }
        if (entries.length === 0) console.log("   (No tokens found)");
        entries.forEach((e, i) => {
          const masked = e.token.slice(0, 8) + "..." + e.token.slice(-4);
          console.log(`   [${i + 1}] ${e.name}: ${masked}`);
        });
      } catch (err) {
        console.log("   Error reading credentials:", err.message);
      }
    ' "$CREDS_FILE"
  else
    echo "   (credentials file not found)"
  fi
  exit 0
fi

# 1. Update source code if git remote exists
if [ -d "$DIR/.git" ]; then
  if git -C "$DIR" remote get-url origin >/dev/null 2>&1; then
    echo ">> Pulling latest changes from git..."
    git -C "$DIR" pull --ff-only || true
  else
    echo ">> Local git repository (no remote origin configured)."
  fi
fi

# 2. Update or Add Token
if [ "$ACTION" = "add" ] && [ -n "$ARG" ]; then
  echo ">> Adding new token to pool in $CREDS_FILE..."
  mkdir -p "$(dirname "$CREDS_FILE")"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const token = process.argv[2];
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    let key = "default";
    if (data.default && data.default.authToken && data.default.authToken !== token) {
      let count = 2;
      while (data["account_" + count]) count++;
      key = "account_" + count;
    }
    if (!data[key]) data[key] = {};
    data[key].authToken = token;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`>> Successfully saved as [${key}]!`);
  ' "$CREDS_FILE" "$ARG"
  chmod 600 "$CREDS_FILE"
elif [ -n "$ACTION" ] && [ "$ACTION" != "add" ]; then
  NEW_TOKEN="$ACTION"
  echo ">> Updating primary auth token in $CREDS_FILE..."
  mkdir -p "$(dirname "$CREDS_FILE")"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const token = process.argv[2];
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    if (!data.default) data.default = {};
    data.default.authToken = token;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  ' "$CREDS_FILE" "$NEW_TOKEN"
  chmod 600 "$CREDS_FILE"
  echo ">> Primary token updated successfully!"
fi

# 3. Verify Tokens in Pool
TOKEN_COUNT=$(node -e '
  const fs = require("fs");
  const credPath = process.argv[1];
  let count = 0;
  if (process.env.FREEBUFF_AUTH_TOKENS) {
    count += process.env.FREEBUFF_AUTH_TOKENS.split(",").filter(Boolean).length;
  }
  if (process.env.FREEBUFF_AUTH_TOKEN) count++;
  if (fs.existsSync(credPath)) {
    try {
      const d = JSON.parse(fs.readFileSync(credPath, "utf8"));
      if (Array.isArray(d.tokens)) count += d.tokens.length;
      for (const k of Object.keys(d)) {
        if (d[k]?.authToken) count++;
      }
    } catch {}
  }
  console.log(count);
' "$CREDS_FILE")

if [ "$TOKEN_COUNT" -eq 0 ]; then
  echo ">> Warning: No auth tokens found in pool."
  echo "   To set a token, run: ./update.sh <YOUR_TOKEN>"
  echo "   To add multiple:     ./update.sh add <ADDITIONAL_TOKEN>"
  echo "   Get tokens from:     https://freebuff.llm.pm"
else
  echo ">> Token Pool: $TOKEN_COUNT account(s) ready."
fi

# 4. Re-register in pi CLI if needed
echo ">> Checking pi CLI registration..."
if command -v pi >/dev/null 2>&1; then
  pi install "$DIR" >/dev/null 2>&1 || true
  echo ">> Verified models in pi CLI:"
  pi --list-models | grep freebuff || true
else
  echo ">> pi CLI not found in PATH."
fi

echo ">> Done! Tip: type /freebuff inside pi CLI to view or rotate accounts."
