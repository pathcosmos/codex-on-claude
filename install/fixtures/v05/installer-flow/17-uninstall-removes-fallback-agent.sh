#!/usr/bin/env bash
# L3.17 (A1) — uninstall must remove BOTH primary + fallback reviewer agents.
# v0.4.1 introduced installed.agents[] array (primary + fallback). The previous cmdUninstall
# only iterated the legacy singular installed.agent field, orphaning codex-reviewer-fallback.md
# in ~/.claude/agents/ forever.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.17: uninstall removes both primary + fallback reviewer agents (A1)"

# 1) Install with contextPolicy=mixed → installs both codex-reviewer + codex-reviewer-fallback
coc --usage-mode=synergy --patterns=review --context-policy=mixed --improvement-loop=manual \
    --threads=basic --subscription-claude=max --subscription-codex=pro --yes >/dev/null 2>&1 \
  || { echo "✗ install failed" >&2; exit 1; }

primary="$HOME/.claude/agents/codex-reviewer.md"
fallback="$HOME/.claude/agents/codex-reviewer-fallback.md"

# Both files should exist after install
[ -f "$primary" ] || { echo "✗ primary agent missing" >&2; exit 1; }
[ -f "$fallback" ] || { echo "✗ fallback agent missing" >&2; exit 1; }
echo "  ✓ both primary + fallback agents installed"

# 2) State should record both in installed.agents[]
agents_list="$(json_get "$HOME/.claude/codex-on-claude/config.json" '.installed.agents | join(",")')"
assert_contains "$agents_list" "codex-reviewer" "primary in installed.agents"
assert_contains "$agents_list" "codex-reviewer-fallback" "fallback in installed.agents"

# 3) Uninstall
coc uninstall >/dev/null 2>&1 || { echo "✗ uninstall failed" >&2; exit 1; }

# 4) Both agent files MUST be gone (A1 fix verifies this)
if [ -f "$primary" ]; then
  echo "✗ primary agent still present after uninstall: $primary" >&2
  exit 1
fi
echo "  ✓ primary agent removed"

if [ -f "$fallback" ]; then
  echo "✗ fallback agent still present after uninstall (A1 regression): $fallback" >&2
  exit 1
fi
echo "  ✓ fallback agent removed (A1 fix verified)"

echo "✓ L3.17 PASS"
