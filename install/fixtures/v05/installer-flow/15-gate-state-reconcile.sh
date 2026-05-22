#!/usr/bin/env bash
# L3.15 (H3) — gate state reconciliation: even if config.installed.gateHooks is stale (false),
# applyInstallation must inspect actual settings.json and remove orphan gate entries on a
# non-`none` reconfigure. Also verifies that the gate command embeds --enforce-mode=none (H2).
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.15: gate state reconciliation + --enforce-mode flag baked in"

# 1) Install with mode=none → gate present + command embeds --enforce-mode=none
coc --usage-mode=none --patterns=review --context-policy=mixed --improvement-loop=manual \
    --threads=basic --subscription-claude=max --subscription-codex=pro --yes >/dev/null 2>&1 \
  || { echo "✗ initial install failed" >&2; exit 1; }

settings="$HOME/.claude/settings.json"
cmd="$(jq -r '(.hooks.PreToolUse // [])[] | select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate") | .hooks[]?.command' "$settings" | head -1)"
assert_contains "$cmd" "--enforce-mode=none" "gate command embeds --enforce-mode=none (H2 fix)"

# 2) Manually corrupt the state: set installed.gateHooks to false even though settings.json has gate.
config="$HOME/.claude/codex-on-claude/config.json"
jq '.installed.gateHooks = false' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
state_says="$(json_get "$config" '.installed.gateHooks')"
assert_eq "false" "$state_says" "state forcibly drifted (gateHooks=false despite gate present)"

# 3) Reconfigure to mode=synergy → reconcile should kick in and remove the orphan gate.
coc reconfigure --usage-mode=synergy --yes >/dev/null 2>&1 \
  || { echo "✗ reconfigure failed" >&2; exit 1; }

# Gate must be gone from settings.json
gate_count="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings" 2>/dev/null || echo "0")"
assert_eq "0" "$gate_count" "orphan gate reconciled (removed) on switch to synergy"

mode_after="$(json_get "$config" '.choices.usageMode')"
assert_eq "synergy" "$mode_after" "post-reconcile mode is synergy"

# 4) Switch back to none → gate command must include --enforce-mode=none again.
coc reconfigure --usage-mode=none --yes >/dev/null 2>&1 \
  || { echo "✗ reconfigure to none failed" >&2; exit 1; }

cmd2="$(jq -r '(.hooks.PreToolUse // [])[] | select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate") | .hooks[]?.command' "$settings" | head -1)"
assert_contains "$cmd2" "--enforce-mode=none" "re-installed gate also embeds --enforce-mode=none"

echo "✓ L3.15 PASS"
