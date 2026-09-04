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

# 1. Update source code if git remote exists
if [ -d "$DIR/.git" ]; then
  if git -C "$DIR" remote get-url origin >/dev/null 2>&1; then
    echo ">> Pulling latest changes from git..."
    git -C "$DIR" pull --ff-only || true
  else
    echo ">> Local git repository (no remote origin configured)."
  fi
fi

# 2. Update Auth Token if provided as argument
NEW_TOKEN="$1"
if [ -n "$NEW_TOKEN" ]; then
  echo ">> Updating auth token in $CREDS_FILE..."
  mkdir -p "$(dirname "$CREDS_FILE")"
  if [ -f "$CREDS_FILE" ]; then
    # Update authToken inside existing json safely via node
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
  else
    echo "{\"default\":{\"authToken\":\"$NEW_TOKEN\"}}" > "$CREDS_FILE"
  fi
  chmod 600 "$CREDS_FILE"
  echo ">> Token updated successfully!"
fi

# 3. Verify Token
TOKEN_EXISTS=$(node -e '
  const fs = require("fs");
  const credPath = process.argv[1];
  if (process.env.FREEBUFF_AUTH_TOKEN) { process.exit(0); }
  if (fs.existsSync(credPath)) {
    try {
      const d = JSON.parse(fs.readFileSync(credPath, "utf8"));
      if (d.default?.authToken || Object.values(d).some(v => v?.authToken)) process.exit(0);
    } catch {}
  }
  process.exit(1);
' "$CREDS_FILE" && echo "yes" || echo "no")

if [ "$TOKEN_EXISTS" = "no" ]; then
  echo ">> Warning: No auth token found."
  echo "   To set a token, run: ./update.sh <YOUR_TOKEN>"
  echo "   Or get one from: https://freebuff.llm.pm"
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

echo ">> Done! Tip: type /reload inside pi CLI to apply changes immediately."
