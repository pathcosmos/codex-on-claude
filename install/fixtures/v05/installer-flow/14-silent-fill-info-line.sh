#!/usr/bin/env bash
# L3.14 (G2) — silent-fill info line fires for auto-detected reconfigure (npx upgrade path),
# NOT for explicit `reconfigure` sub-command (which should surface the §7 prompt).
#
# Tests both branches of the isExplicitReconfigure distinction.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.14: silent-fill info line fires for auto-detected reconfigure"

# 1. Hand-craft a v0.4.1-style config (no usageMode field)
mkdir -p "$HOME/.claude/codex-on-claude"
mkdir -p "$HOME/.claude/skills/codex-review"
cat > "$HOME/.claude/codex-on-claude/config.json" <<'JSON'
{
  "version": "0.4.1",
  "choices": {
    "patterns": ["review"],
    "contextPolicy": "mixed",
    "improvementLoop": "manual",
    "threads": "basic",
    "subscription": {"claude": "max", "codex": "pro"},
    "model": {
      "codex": {"primary": {"id": "gpt-5", "reasoning": "medium"}, "fallback": {"id": "gpt-5", "reasoning": "medium"}},
      "reviewer": {"primary": {"id": "sonnet", "reasoning": "medium"}, "fallback": {"id": "sonnet", "reasoning": "medium"}}
    }
  },
  "installed": {"skills": ["codex-review"], "hooks": false},
  "updatedAt": "2026-05-20T12:00:00.000Z"
}
JSON
# A stub skill file so the installer sees "prior install" coherently.
echo "# stub" > "$HOME/.claude/skills/codex-review/SKILL.md"

# 2a. Auto-detected reconfigure path (no sub-command, just `--yes` no-arg).
out_auto="$(coc --yes 2>&1)" || true
# Strip ANSI so substring assertions are reliable.
out_auto_clean="$(printf '%s' "$out_auto" | sed -E $'s/\x1b\\[[0-9;]*m//g')"

assert_contains "$out_auto_clean" "silent default" "AUTO path emits silent-fill info line"

# Verify migration result on disk: usageMode now set to synergy
mode_after_auto="$(json_get "$HOME/.claude/codex-on-claude/config.json" '.choices.usageMode')"
assert_eq "synergy" "$mode_after_auto" "silent fill applied usageMode=synergy"

# Reset the test bed: re-craft the same v0.4.1 starting state for the second sub-scenario.
cat > "$HOME/.claude/codex-on-claude/config.json" <<'JSON'
{
  "version": "0.4.1",
  "choices": {
    "patterns": ["review"],
    "contextPolicy": "mixed",
    "improvementLoop": "manual",
    "threads": "basic",
    "subscription": {"claude": "max", "codex": "pro"},
    "model": {
      "codex": {"primary": {"id": "gpt-5", "reasoning": "medium"}, "fallback": {"id": "gpt-5", "reasoning": "medium"}},
      "reviewer": {"primary": {"id": "sonnet", "reasoning": "medium"}, "fallback": {"id": "sonnet", "reasoning": "medium"}}
    }
  },
  "installed": {"skills": ["codex-review"], "hooks": false},
  "updatedAt": "2026-05-20T12:00:00.000Z"
}
JSON

# 2b. EXPLICIT reconfigure with --usage-mode=auto --yes → no info line (prompt is bypassed by flag),
#     but the silent-fill branch must NOT fire. Verify by checking the info line text is absent.
out_explicit="$(coc reconfigure --usage-mode=auto --yes 2>&1)" || true
out_explicit_clean="$(printf '%s' "$out_explicit" | sed -E $'s/\x1b\\[[0-9;]*m//g')"
assert_no_match "$out_explicit_clean" "silent default" "EXPLICIT reconfigure does NOT emit silent-fill info"

mode_after_explicit="$(json_get "$HOME/.claude/codex-on-claude/config.json" '.choices.usageMode')"
assert_eq "auto" "$mode_after_explicit" "explicit reconfigure applied --usage-mode=auto"

echo "✓ L3.14 PASS"
