#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If run under sudo, drop root to real user
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  REAL_HOME=$(eval echo "~$SUDO_USER")
  export HOME="$REAL_HOME"
  export PATH="$PATH:$REAL_HOME/.npm-global/bin"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required to run the updater."
  exit 1
fi

exec node "$DIR/manage.js" "$@"
