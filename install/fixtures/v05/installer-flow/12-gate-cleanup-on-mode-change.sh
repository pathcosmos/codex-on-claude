#!/usr/bin/env bash
# L3.12 — Gate hooks toggle on mode flips.
#   1) Install mode=none → expect 2 PreToolUse gate groups.
#   2) Reconfigure to synergy → expect 0 PreToolUse gate groups.
#   3) Reconfigure back to none → expect 2 groups again.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.12: PreToolUse gate cleanup across mode changes"

settings="$HOME/.claude/settings.json"

count_gate_groups() {
  if [ ! -f "$settings" ]; then echo "0"; return; fi
  jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings"
}

# Step 1 — install with mode=none.
coc --usage-mode=none \
    --patterns=review --context-policy=mixed --improvement-loop=manual --threads=basic \
    --subscription-claude=max --subscription-codex=pro \
    --yes >/dev/null 2>&1 || { echo "✗ step1 install failed" >&2; exit 1; }
c1="$(count_gate_groups)"
assert_eq "2" "$c1" "step1: 2 PreToolUse gate groups after mode=none install"

# Step 2 — reconfigure to synergy.
coc reconfigure --usage-mode=synergy --yes >/dev/null 2>&1 || { echo "✗ step2 reconfigure failed" >&2; exit 1; }
c2="$(count_gate_groups)"
assert_eq "0" "$c2" "step2: 0 PreToolUse gate groups after switch to synergy"

# Step 3 — reconfigure back to none.
coc reconfigure --usage-mode=none --yes >/dev/null 2>&1 || { echo "✗ step3 reconfigure failed" >&2; exit 1; }
c3="$(count_gate_groups)"
assert_eq "2" "$c3" "step3: 2 PreToolUse gate groups restored after switch back to none"

echo "✓ L3.12 PASS"
