#!/usr/bin/env bash
# L3.7 — `coc status` output sanity for an installed mode.
# Expected: output includes "usageMode:" + the actual mode name, and the
# "PreToolUse gate:" status line.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.7: coc status after install"

coc --usage-mode=none \
    --patterns=review --context-policy=mixed --improvement-loop=manual --threads=basic \
    --subscription-claude=max --subscription-codex=pro \
    --yes >/dev/null 2>&1 || { echo "✗ install failed" >&2; exit 1; }

out="$(coc status 2>&1)" || { echo "$out"; echo "✗ status exited non-zero" >&2; exit 1; }

assert_contains "$out" "usageMode:" "status prints 'usageMode:' label"
assert_contains "$out" "none" "status prints mode name 'none'"
assert_contains "$out" "PreToolUse gate:" "status prints PreToolUse gate line"
# When mode=none the gate is installed, so the line should mention the matchers.
# v0.5.0 post-L6 fix: wildcard MCP regex + Bash gate matcher.
assert_contains "$out" "mcp__codex__" "status mentions codex MCP matcher"
assert_contains "$out" "Bash" "status mentions Bash gate matcher (L6.2 fix)"

echo "✓ L3.7 PASS"
