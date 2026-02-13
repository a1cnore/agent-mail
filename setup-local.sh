#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${SCRIPT_DIR}"
BIN_DIR=""
SKIP_PATH=0
SKIP_ENV_TEMPLATE=0

usage() {
  cat <<'EOF'
AgentMail local setup script

Installs AgentMail from an existing local checkout (no clone/pull).

Usage:
  ./setup-local.sh [options]

Options:
  --repo-dir <path>     Local git checkout to install from (default: current script directory)
  --bin-dir <path>      Install directory for binary (default: ~/.local/bin)
  --skip-path           Do not update shell rc file with PATH entry
  --skip-env-template   Do not copy .env.example to ~/.agentmail/.env when missing
  -h, --help            Show this help message
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-dir)
      REPO_DIR="${2:?Missing value for --repo-dir}"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="${2:?Missing value for --bin-dir}"
      shift 2
      ;;
    --skip-path)
      SKIP_PATH=1
      shift
      ;;
    --skip-env-template)
      SKIP_ENV_TEMPLATE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "Error: --repo-dir must point to a git repository: ${REPO_DIR}" >&2
  exit 1
fi

ARGS=(--repo-dir "${REPO_DIR}")

if [ -n "${BIN_DIR}" ]; then
  ARGS+=(--bin-dir "${BIN_DIR}")
fi

if [ "${SKIP_PATH}" -eq 1 ]; then
  ARGS+=(--skip-path)
fi

if [ "${SKIP_ENV_TEMPLATE}" -eq 1 ]; then
  ARGS+=(--skip-env-template)
fi

exec bash "${SCRIPT_DIR}/setup.sh" "${ARGS[@]}"
