#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO_URL="https://github.com/a1cnore/aimail.git"
DEFAULT_REPO_DIR="${HOME}/.local/src/aimail"
DEFAULT_BIN_DIR="${HOME}/.local/bin"

REPO_URL="${DEFAULT_REPO_URL}"
REPO_DIR="${DEFAULT_REPO_DIR}"
BIN_DIR="${DEFAULT_BIN_DIR}"
EXISTING_REPO_DIR=""
SKIP_PATH=0
SKIP_ENV_TEMPLATE=0

usage() {
  cat <<'EOF'
AgentMail setup script

Installs AgentMail by cloning (or updating) the repository, building the standalone binary,
and installing `agentmail` into your local bin directory.

Usage:
  ./setup.sh [options]

Options:
  --repo-url <url>      Git repository URL (default: https://github.com/a1cnore/aimail.git)
  --repo-dir <path>     Existing local repo to use (skip clone/pull)
  --clone-dir <path>    Target clone directory when using --repo-url (default: ~/.local/src/aimail)
  --bin-dir <path>      Install directory for binary (default: ~/.local/bin)
  --skip-path           Do not update shell rc file with PATH entry
  --skip-env-template   Do not copy .env.example to ~/.agentmail/.env when missing
  -h, --help            Show this help message
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Error: required command not found: ${cmd}" >&2
    exit 1
  fi
}

path_contains_entry() {
  local entry="$1"
  case ":${PATH}:" in
    *":${entry}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

shell_rc_file() {
  case "${SHELL:-}" in
    */zsh) printf '%s\n' "${HOME}/.zshrc" ;;
    */bash) printf '%s\n' "${HOME}/.bashrc" ;;
    *) printf '%s\n' "${HOME}/.profile" ;;
  esac
}

append_path_if_needed() {
  local target_bin_dir="$1"
  if [ "${SKIP_PATH}" -eq 1 ]; then
    echo "Skipping PATH update (--skip-path enabled)."
    return 0
  fi

  local rc_file
  rc_file="$(shell_rc_file)"
  local path_line
  path_line="export PATH=\"${target_bin_dir}:\$PATH\""

  if path_contains_entry "${target_bin_dir}"; then
    echo "PATH already contains ${target_bin_dir}"
    return 0
  fi

  if [ -f "${rc_file}" ] && grep -Fq "${path_line}" "${rc_file}"; then
    echo "PATH export already present in ${rc_file}"
    return 0
  fi

  touch "${rc_file}"
  {
    echo ""
    echo "# Added by AgentMail setup"
    echo "${path_line}"
  } >>"${rc_file}"
  echo "Added PATH entry to ${rc_file}"
}

clone_or_update_repo() {
  local repo_url="$1"
  local target_dir="$2"

  mkdir -p "$(dirname "${target_dir}")"

  if [ -d "${target_dir}/.git" ]; then
    echo "Using existing clone at ${target_dir}"
    if git -C "${target_dir}" diff --quiet && git -C "${target_dir}" diff --cached --quiet; then
      echo "Updating clone with git pull --ff-only"
      git -C "${target_dir}" pull --ff-only
    else
      echo "Repo has local changes; skipping git pull."
    fi
    return 0
  fi

  if [ -e "${target_dir}" ]; then
    echo "Error: ${target_dir} exists but is not a git repository." >&2
    exit 1
  fi

  echo "Cloning ${repo_url} -> ${target_dir}"
  git clone "${repo_url}" "${target_dir}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-url)
      REPO_URL="${2:?Missing value for --repo-url}"
      shift 2
      ;;
    --repo-dir)
      EXISTING_REPO_DIR="${2:?Missing value for --repo-dir}"
      shift 2
      ;;
    --clone-dir)
      REPO_DIR="${2:?Missing value for --clone-dir}"
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

require_command git
require_command bun

if [ -n "${EXISTING_REPO_DIR}" ]; then
  if [ ! -d "${EXISTING_REPO_DIR}/.git" ]; then
    echo "Error: --repo-dir must point to a git repository: ${EXISTING_REPO_DIR}" >&2
    exit 1
  fi
  REPO_DIR="${EXISTING_REPO_DIR}"
else
  clone_or_update_repo "${REPO_URL}" "${REPO_DIR}"
fi

echo "Installing dependencies in ${REPO_DIR}"
cd "${REPO_DIR}"
bun install

echo "Building standalone binary"
bun run build:standalone

if [ ! -x "${REPO_DIR}/dist/agentmail" ]; then
  echo "Error: expected built binary at ${REPO_DIR}/dist/agentmail" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}"
install -m 755 "${REPO_DIR}/dist/agentmail" "${BIN_DIR}/agentmail"
echo "Installed binary to ${BIN_DIR}/agentmail"

mkdir -p "${HOME}/.agentmail"
if [ "${SKIP_ENV_TEMPLATE}" -eq 0 ] && [ ! -f "${HOME}/.agentmail/.env" ] && [ -f "${REPO_DIR}/.env.example" ]; then
  cp "${REPO_DIR}/.env.example" "${HOME}/.agentmail/.env"
  chmod 600 "${HOME}/.agentmail/.env"
  echo "Created template config at ${HOME}/.agentmail/.env"
fi

append_path_if_needed "${BIN_DIR}"

echo ""
echo "Setup complete."
echo "Run: agentmail --help"
if [ "${SKIP_PATH}" -eq 0 ] && ! path_contains_entry "${BIN_DIR}"; then
  echo "Open a new shell or run: source $(shell_rc_file)"
fi
