#!/usr/bin/env bash
# Bash helper library for codex-on-claude v0.5.0 L3 installer-flow scenarios.
# Sourced by every 01-12 scenario script and by run-flow.sh.
#
# Provides:
#   setup_isolated_home   — mktemp $HOME under /var/folders or /tmp
#   cleanup_home          — rm -rf the tmp HOME (safety-checked prefix)
#   assert_isolated_home  — fail-stop if $HOME points at user's real home
#   coc                   — wrapper that invokes the repo installer via node
#   assert_eq / assert_contains / assert_no_match — printable assertions
#   json_get              — jq -r wrapper with a friendly error
#
# Conventions:
#   - REPO_ROOT is resolved once, relative to this script.
#   - Helpers print "✓ description" (pass) or "✗ description …" (fail).
#   - On any assertion failure, exit 1 immediately so the driver can count it.

# Resolve REPO_ROOT once, independent of CWD. This script lives at:
#   <REPO_ROOT>/install/fixtures/v05/installer-flow/helpers.sh
__HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$__HELPERS_DIR/../../../.." && pwd)"
export REPO_ROOT

# Real user home — captured before any mutation so assert_isolated_home can compare.
REAL_HOME_AT_SOURCE="${REAL_HOME_AT_SOURCE:-$HOME}"
export REAL_HOME_AT_SOURCE

# Require jq to be on PATH — every scenario uses it for config inspection.
if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq not found on PATH — install jq (e.g. brew install jq) and re-run." >&2
  exit 1
fi

setup_isolated_home() {
  TMPHOME="$(mktemp -d -t coc-v05-XXXXXX)"
  export TMPHOME
  export HOME="$TMPHOME"
  mkdir -p "$HOME/.claude"
}

cleanup_home() {
  # Belt-and-suspenders: only nuke directories that look like mktemp outputs.
  if [ -z "${TMPHOME:-}" ]; then
    return 0
  fi
  case "$TMPHOME" in
    /tmp/*|/var/folders/*)
      rm -rf "$TMPHOME"
      ;;
    *)
      echo "✗ cleanup_home refusing to remove '$TMPHOME' (not under /tmp or /var/folders)" >&2
      return 1
      ;;
  esac
}

assert_isolated_home() {
  case "$HOME" in
    /tmp/*|/var/folders/*) ;;
    *)
      echo "✗ assert_isolated_home: HOME='$HOME' is not under /tmp or /var/folders — refusing to proceed." >&2
      exit 99
      ;;
  esac
  if [ "$HOME" = "$REAL_HOME_AT_SOURCE" ]; then
    echo "✗ assert_isolated_home: HOME equals real user home '$HOME' — refusing to proceed." >&2
    exit 99
  fi
}

# coc <args...> — invokes the repo installer with the current $HOME isolation.
# Uses `node` directly so we don't depend on `codex-on-claude` being on PATH.
coc() {
  node "$REPO_ROOT/install/install.mjs" "$@"
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local desc="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"
  else
    echo "  ✗ $desc (expected='$expected' actual='$actual')" >&2
    exit 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local desc="$3"
  case "$haystack" in
    *"$needle"*)
      echo "  ✓ $desc"
      ;;
    *)
      echo "  ✗ $desc (needle='$needle' not found)" >&2
      echo "  --- haystack (first 400 chars) ---" >&2
      echo "${haystack:0:400}" >&2
      echo "  --- end haystack ---" >&2
      exit 1
      ;;
  esac
}

assert_no_match() {
  local haystack="$1"
  local needle="$2"
  local desc="$3"
  case "$haystack" in
    *"$needle"*)
      echo "  ✗ $desc (needle='$needle' unexpectedly present)" >&2
      echo "  --- haystack (first 400 chars) ---" >&2
      echo "${haystack:0:400}" >&2
      echo "  --- end haystack ---" >&2
      exit 1
      ;;
    *)
      echo "  ✓ $desc"
      ;;
  esac
}

# json_get <file> <jq-expr>
# Echo jq -r result, or exit 1 with a friendly error if the file is missing
# or the jq invocation fails.
json_get() {
  local file="$1"
  local expr="$2"
  if [ ! -f "$file" ]; then
    echo "✗ json_get: file not found: $file" >&2
    exit 1
  fi
  if ! jq -r "$expr" "$file" 2>/tmp/coc-jq-err.$$; then
    echo "✗ json_get: jq failed on '$file' with expr '$expr'" >&2
    cat /tmp/coc-jq-err.$$ >&2
    rm -f /tmp/coc-jq-err.$$
    exit 1
  fi
  rm -f /tmp/coc-jq-err.$$
}
