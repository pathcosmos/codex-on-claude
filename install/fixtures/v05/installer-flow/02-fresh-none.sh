#!/usr/bin/env bash
# L3.2 — Fresh install with --usage-mode=none (Codex blocked at the gate).
# Expected: usageMode=none, installed.gateHooks=true, settings.json has 2
# PreToolUse groups with marker codex-on-claude:usage-gate.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.2: fresh install --usage-mode=none"

out="$(coc \
  --usage-mode=none \
  --patterns=review \
  --context-policy=mixed \
  --improvement-loop=manual \
  --threads=basic \
  --subscription-claude=max \
  --subscription-codex=pro \
  --yes 2>&1)" || { echo "$out"; echo "✗ installer exited non-zero" >&2; exit 1; }

config="$HOME/.claude/codex-on-claude/config.json"
settings="$HOME/.claude/settings.json"

mode="$(json_get "$config" '.choices.usageMode')"
assert_eq "none" "$mode" "usageMode is none"

gate_hooks="$(json_get "$config" '.installed.gateHooks')"
assert_eq "true" "$gate_hooks" "installed.gateHooks is true"

# Verify settings.json now exists and has exactly 2 PreToolUse groups carrying our marker.
if [ ! -f "$settings" ]; then
  echo "✗ settings.json missing — expected gate hooks to be written" >&2
  exit 1
fi

pre_count="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
assert_eq "2" "$pre_count" "2 PreToolUse usage-gate groups present"

# Both expected matchers — v0.5.0 post-L6 fix: wildcard MCP regex + Bash gate.
matchers="$(jq -r '(.hooks.PreToolUse // [])[] | select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate") | .matcher' "$settings" | sort | tr '\n' ',')"
assert_eq "Bash,mcp__codex__.*," "$matchers" "matchers cover Bash CLI + wildcard MCP codex tools"

echo "✓ L3.2 PASS"
