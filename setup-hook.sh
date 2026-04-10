#!/usr/bin/env bash
set -euo pipefail

AGENTMAIL_DIR="${HOME}/.agentmail"
PROFILE_NAME=""
APPLY_TO_ALL_PROFILES=0

usage() {
  cat <<'EOF'
AgentMail hook setup

Usage:
  ./setup-hook.sh
  ./setup-hook.sh --profile <name>
  ./setup-hook.sh --all-profiles

Options:
  --profile <name>   Write hook for one profile at ~/.agentmail/profiles/<name>/hooks/on_recieve.sh
  --all-profiles     Write hook for all existing profiles under ~/.agentmail/profiles
  -h, --help         Show this help message
EOF
}

validate_profile_name() {
  local profile="$1"

  if [ -z "${profile}" ]; then
    echo "Error: profile name must not be empty." >&2
    exit 1
  fi

  if [[ "${profile}" == *"/"* || "${profile}" == *"\\"* ]]; then
    echo "Error: profile name must not include path separators." >&2
    exit 1
  fi

  if [[ "${profile}" == "." || "${profile}" == ".." || "${profile}" == *".."* ]]; then
    echo "Error: profile name must not include '..'." >&2
    exit 1
  fi

  if [[ ! "${profile}" =~ ^[A-Za-z0-9._@-]+$ ]]; then
    echo "Error: profile name may contain only letters, numbers, dot, underscore, hyphen, or @." >&2
    exit 1
  fi
}

write_hook() {
  local hook_file="$1"
  mkdir -p "$(dirname "${hook_file}")"
  cat >"${hook_file}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "New mail from: $AGENTMAIL_MESSAGE_FROM | Subject: $AGENTMAIL_MESSAGE_SUBJECT"
# put any bash command here
EOF
  chmod +x "${hook_file}"
  echo "Wrote ${hook_file}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      PROFILE_NAME="${2:?Missing value for --profile}"
      shift 2
      ;;
    --all-profiles)
      APPLY_TO_ALL_PROFILES=1
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

if [ -n "${PROFILE_NAME}" ] && [ "${APPLY_TO_ALL_PROFILES}" -eq 1 ]; then
  echo "Error: use either --profile or --all-profiles, not both." >&2
  exit 1
fi

if [ -n "${PROFILE_NAME}" ]; then
  validate_profile_name "${PROFILE_NAME}"
  write_hook "${AGENTMAIL_DIR}/profiles/${PROFILE_NAME}/hooks/on_recieve.sh"
  exit 0
fi

if [ "${APPLY_TO_ALL_PROFILES}" -eq 1 ]; then
  profiles_root="${AGENTMAIL_DIR}/profiles"

  if [ ! -d "${profiles_root}" ]; then
    echo "Error: profiles directory not found: ${profiles_root}" >&2
    exit 1
  fi

  shopt -s nullglob
  profile_dirs=("${profiles_root}"/*)
  shopt -u nullglob

  written_count=0
  for profile_dir in "${profile_dirs[@]}"; do
    if [ ! -d "${profile_dir}" ]; then
      continue
    fi

    write_hook "${profile_dir}/hooks/on_recieve.sh"
    written_count=$((written_count + 1))
  done

  if [ "${written_count}" -eq 0 ]; then
    echo "Error: no profiles found under ${profiles_root}" >&2
    exit 1
  fi

  echo "Configured hooks for ${written_count} profile(s)."
  exit 0
fi

write_hook "${AGENTMAIL_DIR}/hooks/on_recieve.sh"
