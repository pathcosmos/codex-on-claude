#!/usr/bin/env bash
# L3.3 — Fresh install with --usage-mode=max + --auto-tier2-llm-probe=on.
# Expected: usageMode=max, autoTier2LLMProbe=true.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.3: fresh install --usage-mode=max --auto-tier2-llm-probe=on"

out="$(coc \
  --usage-mode=max \
  --auto-tier2-llm-probe=on \
  --patterns=review \
  --context-policy=mixed \
  --improvement-loop=manual \
  --threads=basic \
  --subscription-claude=max \
  --subscription-codex=pro \
  --yes 2>&1)" || { echo "$out"; echo "✗ installer exited non-zero" >&2; exit 1; }

config="$HOME/.claude/codex-on-claude/config.json"

mode="$(json_get "$config" '.choices.usageMode')"
assert_eq "max" "$mode" "usageMode is max"

probe="$(json_get "$config" '.choices.autoTier2LLMProbe')"
assert_eq "true" "$probe" "autoTier2LLMProbe is true"

# max mode does not register PreToolUse gate hooks.
gate_hooks="$(json_get "$config" '.installed.gateHooks // false')"
assert_eq "false" "$gate_hooks" "max mode does not install gate hooks"

echo "✓ L3.3 PASS"
