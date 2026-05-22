#!/usr/bin/env bash
# L3.1 — Fresh install with --usage-mode=synergy (the recommended default).
# Expected: config.json.choices.usageMode === "synergy", no gateHooks,
# ~/.claude/settings.json has no PreToolUse entries from us.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.1: fresh install --usage-mode=synergy"

out="$(coc \
  --usage-mode=synergy \
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
assert_eq "synergy" "$mode" "usageMode is synergy"

# gateHooks should be absent or false. jq -r prints "null" if the key is missing.
gate_hooks="$(json_get "$config" '.installed.gateHooks // false')"
assert_eq "false" "$gate_hooks" "installed.gateHooks is not true"

# settings.json may exist (PostToolUse hooks for improvementLoop=manual are NOT installed,
# so the file should be empty / not present). PreToolUse must not contain our marker.
if [ -f "$settings" ]; then
  pre_count="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
  assert_eq "0" "$pre_count" "no PreToolUse usage-gate entries in settings.json"
else
  echo "  ✓ settings.json absent (no hooks installed) — expected for synergy + manual"
fi

echo "✓ L3.1 PASS"
