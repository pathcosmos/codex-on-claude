#!/usr/bin/env bash
# L3.13 (G1) — `--usage-mode max` (space-separated, common user mistake) must error,
# not silently fall through with the value dropped. Verifies the unknown-positional guard.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.13: --usage-mode max (space-separated) triggers error + hint"

# Run the installer with the BAD syntax (space, not =). Expect non-zero exit + helpful message.
set +e
out="$(node "$REPO_ROOT/install/install.mjs" --usage-mode max --yes 2>&1)"
rc=$?
set -e

assert_eq "2" "$rc" "exit code is 2 (validation error)"
assert_contains "$out" "Unknown command or positional argument" "error mentions unknown positional"
assert_contains "$out" "max" "error includes the offending value"
assert_contains "$out" "--usage-mode=max" "hint suggests the = syntax"

# Now verify the CORRECT syntax still works.
out2="$(coc \
  --usage-mode=max \
  --patterns=review \
  --context-policy=mixed \
  --improvement-loop=manual \
  --threads=basic \
  --subscription-claude=max \
  --subscription-codex=pro \
  --yes 2>&1)" || { echo "$out2"; echo "✗ correct-syntax install failed" >&2; exit 1; }

mode="$(json_get "$HOME/.claude/codex-on-claude/config.json" '.choices.usageMode')"
assert_eq "max" "$mode" "correct = syntax sets usageMode=max"

echo "✓ L3.13 PASS"
