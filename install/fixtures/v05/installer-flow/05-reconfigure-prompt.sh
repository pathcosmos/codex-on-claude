#!/usr/bin/env bash
# L3.5 — Explicit `reconfigure` surfaces the usage-mode prompt (or, with --yes,
# accepts the override flag). Same v0.4.1 starting state as L3.4, but run
# `reconfigure --usage-mode=auto --yes`. Expected: usageMode=auto post-run.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.5: explicit reconfigure with --usage-mode=auto"

mkdir -p "$HOME/.claude/codex-on-claude"
mkdir -p "$HOME/.claude/skills"
mkdir -p "$HOME/.claude/agents"

cat > "$HOME/.claude/codex-on-claude/config.json" <<'JSON'
{
  "version": "0.4.1",
  "choices": {
    "patterns": ["review"],
    "contextPolicy": "mixed",
    "improvementLoop": "manual",
    "threads": "basic",
    "subscription": { "claude": "max", "codex": "pro" },
    "model": {
      "codex":    { "primary": { "id": "gpt-5.5", "reasoning": "xhigh" },  "fallback": { "id": "gpt-5", "reasoning": "medium" } },
      "reviewer": { "primary": { "id": "haiku",   "reasoning": "xhigh" },  "fallback": { "id": "sonnet", "reasoning": "medium" } }
    }
  },
  "installed": { "skills": ["codex-review"], "agents": ["codex-reviewer"], "agent": "codex-reviewer" },
  "mcp": { "name": "codex", "status": "connected" },
  "updatedAt": "2026-05-01T00:00:00.000Z"
}
JSON

out="$(coc reconfigure --usage-mode=auto --yes 2>&1)" || { echo "$out"; echo "✗ installer exited non-zero" >&2; exit 1; }

config="$HOME/.claude/codex-on-claude/config.json"
mode="$(json_get "$config" '.choices.usageMode')"
assert_eq "auto" "$mode" "reconfigure applied usageMode=auto"

# When usageMode is auto, autoTier2LLMProbe default carries through (true).
probe="$(json_get "$config" '.choices.autoTier2LLMProbe')"
assert_eq "true" "$probe" "autoTier2LLMProbe defaults to true on reconfigure"

echo "✓ L3.5 PASS"
