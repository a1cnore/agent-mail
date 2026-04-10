#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTNAME_VALUE="${AGENTMAIL_UI_HOSTNAME:-0.0.0.0}"
PORT_VALUE="${AGENTMAIL_UI_PORT:-8025}"
BUN_BIN="${BUN_BIN:-${HOME}/.bun/bin/bun}"

if [ ! -x "${BUN_BIN}" ]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
  else
    echo "bun executable not found" >&2
    exit 1
  fi
fi

run_ui() {
  cd "${SCRIPT_DIR}"
  exec "${BUN_BIN}" run src/cli.ts inbox --hostname "${HOSTNAME_VALUE}" --port "${PORT_VALUE}"
}

case "${1:---background}" in
  --foreground)
    run_ui
    ;;
  --background)
    cd "${SCRIPT_DIR}"
    nohup "${BUN_BIN}" run src/cli.ts inbox --hostname "${HOSTNAME_VALUE}" --port "${PORT_VALUE}" \
      >/tmp/agentmail-inbox.log 2>&1 &
    ;;
  *)
    echo "Usage: $0 [--foreground|--background]" >&2
    exit 1
    ;;
esac
