#!/usr/bin/env bash
# L3.11 — Bad input handling.
#   --usage-mode=foo            → exit 2, lists allowed: none, synergy, auto, max
#   --auto-tier2-llm-probe=maybe → exit 2
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.11: bad input rejection"

# ----- Case A: --usage-mode=foo
set +e
out_a="$(coc --usage-mode=foo --yes 2>&1)"
code_a=$?
set -e
assert_eq "2" "$code_a" "usage-mode=foo exits with code 2"
assert_contains "$out_a" "--usage-mode=foo" "error message echoes the bad flag value"
# Must list the allowed values
assert_contains "$out_a" "none" "allowed list mentions 'none'"
assert_contains "$out_a" "synergy" "allowed list mentions 'synergy'"
assert_contains "$out_a" "auto" "allowed list mentions 'auto'"
assert_contains "$out_a" "max" "allowed list mentions 'max'"

# Config should NOT have been written (failure happens before applyInstallation).
if [ -f "$HOME/.claude/codex-on-claude/config.json" ]; then
  echo "✗ config.json was written despite failed validation" >&2
  exit 1
fi

# ----- Case B: --auto-tier2-llm-probe=maybe
set +e
out_b="$(coc --auto-tier2-llm-probe=maybe --yes 2>&1)"
code_b=$?
set -e
assert_eq "2" "$code_b" "auto-tier2-llm-probe=maybe exits with code 2"
assert_contains "$out_b" "auto-tier2-llm-probe=maybe" "error message echoes the bad flag value"

echo "✓ L3.11 PASS"
