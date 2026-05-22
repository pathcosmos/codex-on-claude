#!/usr/bin/env bash
# L3.6 — Mode-switch flow: synergy → none → synergy.
# Expected: gateHooks toggles cleanly (false → true → false) and the gate
# install / removal stays race-free.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.6: mode-switch synergy → none → synergy"

# Step 1 — fresh synergy install.
coc --usage-mode=synergy \
    --patterns=review --context-policy=mixed --improvement-loop=manual --threads=basic \
    --subscription-claude=max --subscription-codex=pro \
    --yes >/dev/null 2>&1 || { echo "✗ step1 install failed" >&2; exit 1; }

config="$HOME/.claude/codex-on-claude/config.json"
g1="$(json_get "$config" '.installed.gateHooks // false')"
assert_eq "false" "$g1" "step1: gateHooks=false after synergy install"

# Step 2 — reconfigure to none. Gate hooks should now be installed.
coc reconfigure --usage-mode=none --yes >/dev/null 2>&1 || { echo "✗ step2 reconfigure failed" >&2; exit 1; }
g2="$(json_get "$config" '.installed.gateHooks')"
assert_eq "true" "$g2" "step2: gateHooks=true after reconfigure to none"

settings="$HOME/.claude/settings.json"
pre_count2="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
assert_eq "2" "$pre_count2" "step2: 2 PreToolUse gate groups present"

# Step 3 — reconfigure back to synergy. Gate hooks should be torn down.
coc reconfigure --usage-mode=synergy --yes >/dev/null 2>&1 || { echo "✗ step3 reconfigure failed" >&2; exit 1; }
g3="$(json_get "$config" '.installed.gateHooks // false')"
assert_eq "false" "$g3" "step3: gateHooks=false after reconfigure back to synergy"

pre_count3="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
assert_eq "0" "$pre_count3" "step3: 0 PreToolUse gate groups remain"

echo "✓ L3.6 PASS"
