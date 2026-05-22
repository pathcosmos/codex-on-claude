#!/usr/bin/env bash
# L3.8 — Uninstall removes ALL coc-owned markers from settings.json and
# deletes the state dir under ~/.claude/codex-on-claude.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.8: uninstall cleanup (mode=none install)"

coc --usage-mode=none \
    --patterns=review --context-policy=mixed --improvement-loop=auto-on-skill --threads=basic \
    --subscription-claude=max --subscription-codex=pro \
    --yes >/dev/null 2>&1 || { echo "✗ install failed" >&2; exit 1; }

# Sanity: ensure we have something to clean up.
settings="$HOME/.claude/settings.json"
[ -f "$settings" ] || { echo "✗ settings.json not present after install — nothing to test" >&2; exit 1; }

pre_marker_count="$(grep -c '_coc' "$settings" || true)"
if [ "$pre_marker_count" -lt 1 ]; then
  echo "✗ pre-uninstall: no _coc markers found, test setup is wrong" >&2
  exit 1
fi

out="$(coc uninstall 2>&1)" || { echo "$out"; echo "✗ uninstall exited non-zero" >&2; exit 1; }

# All _coc occurrences must be gone (count via grep -c, but tolerate missing file).
post_count="0"
if [ -f "$settings" ]; then
  post_count="$(grep -c '_coc' "$settings" || true)"
fi
assert_eq "0" "$post_count" "no '_coc' markers remain in settings.json"

# State dir must be removed.
if [ -d "$HOME/.claude/codex-on-claude" ]; then
  # Recent installer also removes the dir. If it's still present, fail.
  echo "✗ ~/.claude/codex-on-claude still exists after uninstall" >&2
  exit 1
else
  echo "  ✓ ~/.claude/codex-on-claude removed"
fi

# Removed-list should mention PreToolUse-gate or PostToolUse hook teardown.
assert_contains "$out" "Removed" "uninstall prints 'Removed:' summary"

echo "✓ L3.8 PASS"
