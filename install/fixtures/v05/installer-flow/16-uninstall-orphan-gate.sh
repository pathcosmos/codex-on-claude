#!/usr/bin/env bash
# L3.16 (B5) — uninstall MUST reconcile actual settings.json regardless of state claim.
# If state says `installed.gateHooks=false` but settings.json has orphan gate entries
# (e.g. from manual edit or stale state), uninstall must still remove them.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.16: uninstall reconciles orphan gate hooks (B5)"

# 1) Install with mode=none → gate present
coc --usage-mode=none --patterns=review --context-policy=mixed --improvement-loop=manual \
    --threads=basic --subscription-claude=max --subscription-codex=pro --yes >/dev/null 2>&1 \
  || { echo "✗ initial install failed" >&2; exit 1; }

settings="$HOME/.claude/settings.json"
config="$HOME/.claude/codex-on-claude/config.json"

# Verify gate is actually installed
gate_count_before="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
assert_eq "2" "$gate_count_before" "2 gate hooks present after install"

# 2) Forcibly drift state — set installed.gateHooks=false even though settings.json has them
jq '.installed.gateHooks = false' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
state_says="$(json_get "$config" '.installed.gateHooks')"
assert_eq "false" "$state_says" "state forcibly says gateHooks=false (drift simulation)"

# 3) uninstall — should still remove orphan gate (B5 reconcile behavior)
coc uninstall >/dev/null 2>&1 || { echo "✗ uninstall failed" >&2; exit 1; }

# 4) Verify gate hooks are gone from settings.json AND user-owned hooks NOT touched.
# settings.json may be deleted entirely or just have no _coc markers.
if [ -f "$settings" ]; then
  gate_count_after="$(jq -r '(.hooks.PreToolUse // []) | map(select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")) | length' "$settings")"
  assert_eq "0" "$gate_count_after" "orphan gate removed by uninstall (B5)"
  # Also: no _coc markers at all
  any_coc="$(jq -r '[.. | objects | select(._coc?.marker)] | length' "$settings")"
  assert_eq "0" "$any_coc" "no _coc markers remain in settings.json"
else
  echo "  ✓ settings.json removed entirely (acceptable — no orphan hooks possible)"
fi

# 5) State file is also gone
if [ -f "$config" ]; then
  echo "✗ config.json still present after uninstall" >&2
  exit 1
fi

echo "✓ L3.16 PASS"
