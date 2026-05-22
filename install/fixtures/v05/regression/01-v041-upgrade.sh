#!/usr/bin/env bash
# L5.1 — v0.4.1 → v0.5.0 silent upgrade (full regression path).
#
# Strategy:
#   1. Hand-craft a v0.4.1-style ~/.claude/codex-on-claude/config.json that
#      lacks the v0.5.0 usageMode + autoTier2LLMProbe fields.
#   2. Pre-seed legacy SKILL.md files + a PostToolUse auto-log hook so the
#      installer sees a real "prior install" (not a fresh state).
#   3. Run `coc --yes` (NOT reconfigure). main() routes existing-state no-arg
#      invocations through cmdInstallOrReconfigure(reconfigure=true), so the
#      v0.4.1 → v0.5.0 banner SHOULD render and a silent fill happens.
#   4. Verify the contract:
#        - exit 0
#        - usageMode silently filled to "synergy"
#        - autoTier2LLMProbe silently filled to true
#        - subscription/model preserved exactly
#        - state.version bumped to manifest.version (0.5.0)
#        - PostToolUse auto-log hook survived (marker codex-on-claude:auto-log)
#        - NO PreToolUse gate hook (mode=synergy doesn't need it)
#        - every installed SKILL.md has zero `{{` placeholders remaining
#        - banner contains `v0.4.1 → v0.5.0` migration marker
#
# A before/after diff is captured to $HOME/.claude/regression-diff.txt for debug.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../installer-flow/helpers.sh"

setup_isolated_home
assert_isolated_home
# Save diff outside $HOME on cleanup so post-mortem inspection survives the
# tmp-dir teardown (helpers' cleanup_home only nukes /tmp|/var/folders dirs).
DIFF_PERSIST="${TMPDIR:-/tmp}/coc-regression-diff-$$.txt"
export DIFF_PERSIST
preserve_and_cleanup() {
  local diff_src="$HOME/.claude/regression-diff.txt"
  if [ -f "$diff_src" ]; then
    cp "$diff_src" "$DIFF_PERSIST" 2>/dev/null || true
    echo "↳ before/after diff preserved at: $DIFF_PERSIST" >&2
  fi
  cleanup_home
}
trap preserve_and_cleanup EXIT

echo "▶ L5.1: v0.4.1 → v0.5.0 silent upgrade"

CFG_DIR="$HOME/.claude/codex-on-claude"
CFG_FILE="$CFG_DIR/config.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
SKILLS_DIR="$HOME/.claude/skills"

mkdir -p "$CFG_DIR"
mkdir -p "$SKILLS_DIR/codex-review"
mkdir -p "$SKILLS_DIR/codex-followup"
mkdir -p "$HOME/.claude/agents"

# --- Step 1: hand-craft a v0.4.1 config.json ---
cat > "$CFG_FILE" <<'JSON'
{
  "version": "0.4.1",
  "choices": {
    "patterns": ["review", "followup"],
    "contextPolicy": "mixed",
    "improvementLoop": "auto-on-skill",
    "threads": "basic",
    "subscription": {"claude": "max", "codex": "pro"},
    "model": {
      "codex":    {"primary": {"id": "gpt-5", "reasoning": "medium"}, "fallback": {"id": "gpt-5", "reasoning": "medium"}},
      "reviewer": {"primary": {"id": "sonnet", "reasoning": "medium"}, "fallback": {"id": "sonnet", "reasoning": "medium"}}
    }
  },
  "installed": {"skills": ["codex-review", "codex-followup"], "hooks": true},
  "updatedAt": "2026-05-20T12:00:00.000Z"
}
JSON

# --- Step 2: pre-create legacy skill files so the installer sees a prior install ---
cat > "$SKILLS_DIR/codex-review/SKILL.md" <<'MD'
---
name: codex-review
description: legacy v0.4.1 placeholder content (should be overwritten on upgrade)
---
This is a legacy v0.4.1 SKILL.md left over from a prior install.
MD

cat > "$SKILLS_DIR/codex-followup/SKILL.md" <<'MD'
---
name: codex-followup
description: legacy v0.4.1 placeholder content (should be overwritten on upgrade)
---
This is a legacy v0.4.1 SKILL.md left over from a prior install.
MD

# --- Step 3: pre-seed a v0.4.1-style PostToolUse auto-log hook entry ---
# Marker codex-on-claude:auto-log MUST survive the upgrade (idempotent re-install).
cat > "$SETTINGS_FILE" <<'JSON'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__codex__codex",
        "hooks": [
          {
            "type": "command",
            "command": "node /legacy/path/install.mjs log --from-stdin",
            "_coc": {"marker": "codex-on-claude:auto-log", "installedAt": "2026-05-20T12:00:00.000Z"}
          }
        ]
      },
      {
        "matcher": "mcp__codex__codex-reply",
        "hooks": [
          {
            "type": "command",
            "command": "node /legacy/path/install.mjs log --from-stdin",
            "_coc": {"marker": "codex-on-claude:auto-log", "installedAt": "2026-05-20T12:00:00.000Z"}
          }
        ]
      }
    ]
  }
}
JSON

# Capture BEFORE state
BEFORE_CFG="$(cat "$CFG_FILE")"
BEFORE_SETTINGS="$(cat "$SETTINGS_FILE")"

# --- Step 4: run `coc --yes` (NOT reconfigure) ---
# main() with prior state forces reconfigure=true internally → banner fires.
out="$(coc --yes 2>&1)" || {
  echo "$out" >&2
  echo "✗ installer exited non-zero" >&2
  exit 1
}

# Capture AFTER state and write a diff for debug
AFTER_CFG="$(cat "$CFG_FILE")"
AFTER_SETTINGS="$(cat "$SETTINGS_FILE")"
{
  echo "=== BEFORE config.json ==="
  echo "$BEFORE_CFG"
  echo ""
  echo "=== AFTER config.json ==="
  echo "$AFTER_CFG"
  echo ""
  echo "=== BEFORE settings.json ==="
  echo "$BEFORE_SETTINGS"
  echo ""
  echo "=== AFTER settings.json ==="
  echo "$AFTER_SETTINGS"
  echo ""
  echo "=== installer stdout/stderr (combined) ==="
  echo "$out"
} > "$HOME/.claude/regression-diff.txt"

# --- Step 5: assertions ---

# 5a. usageMode silently filled to "synergy"
mode="$(json_get "$CFG_FILE" '.choices.usageMode')"
assert_eq "synergy" "$mode" "usageMode silently filled to synergy"

# 5b. autoTier2LLMProbe silently filled to true
probe="$(json_get "$CFG_FILE" '.choices.autoTier2LLMProbe')"
assert_eq "true" "$probe" "autoTier2LLMProbe silently filled to true"

# 5c. subscription preserved exactly
sub_claude="$(json_get "$CFG_FILE" '.choices.subscription.claude')"
sub_codex="$(json_get "$CFG_FILE" '.choices.subscription.codex')"
assert_eq "max" "$sub_claude" "subscription.claude preserved (max)"
assert_eq "pro" "$sub_codex" "subscription.codex preserved (pro)"

# 5d. codex primary model preserved
codex_primary="$(json_get "$CFG_FILE" '.choices.model.codex.primary.id')"
assert_eq "gpt-5" "$codex_primary" "model.codex.primary.id preserved (gpt-5)"

# 5e. version bumped to 0.5.0
new_version="$(json_get "$CFG_FILE" '.version')"
assert_eq "0.5.0" "$new_version" "config.version bumped to 0.5.0"

# 5f. PostToolUse auto-log hook still present (marker survived)
ptu_count="$(jq -r '
  [.hooks.PostToolUse[]?
    | .hooks[]?
    | select(._coc.marker == "codex-on-claude:auto-log")
  ] | length
' "$SETTINGS_FILE")"
case "$ptu_count" in
  0) echo "  ✗ PostToolUse auto-log marker lost (count=0)" >&2; exit 1 ;;
  *) echo "  ✓ PostToolUse auto-log marker survived (count=$ptu_count)" ;;
esac

# 5g. NO PreToolUse gate hook (mode=synergy ⇒ no gate)
ptu_gate_count="$(jq -r '
  [.hooks.PreToolUse[]?
    | .hooks[]?
    | select(._coc.marker == "codex-on-claude:usage-gate")
  ] | length
' "$SETTINGS_FILE")"
assert_eq "0" "$ptu_gate_count" "no PreToolUse gate hook (synergy mode)"

# 5h. every installed SKILL.md has zero `{{` placeholders
# (User spec says "all 9", but selected patterns + loop + threads only install a
# subset. We assert ZERO unrendered placeholders across *every* installed SKILL.md,
# which is the substantive check — and additionally report the count.)
shopt -s nullglob
skill_files=( "$SKILLS_DIR"/*/SKILL.md )
shopt -u nullglob
if [ "${#skill_files[@]}" -eq 0 ]; then
  echo "  ✗ no SKILL.md files found under $SKILLS_DIR — install did not run?" >&2
  exit 1
fi
unrendered=0
for f in "${skill_files[@]}"; do
  if grep -q '{{' "$f"; then
    unrendered=$((unrendered + 1))
    echo "  ✗ unrendered placeholder in $f" >&2
    grep -n '{{' "$f" | head -3 >&2
  fi
done
assert_eq "0" "$unrendered" "all ${#skill_files[@]} installed SKILL.md files rendered (no \`{{\` left)"

# 5i. banner contains v0.4.1 → v0.5.0 migration marker
# Banner is emitted via install.mjs:1192 as
#   `v0.4.1` (dim) + ` → ` (bold) + `v0.5.0` (cyan)
# We strip ANSI before matching so the assertion is colour-independent.
out_plain="$(printf '%s' "$out" | sed -E $'s/\x1B\\[[0-9;]*[A-Za-z]//g')"
assert_contains "$out_plain" "v0.4.1" "banner mentions previous v0.4.1"
assert_contains "$out_plain" "v0.5.0" "banner mentions new v0.5.0"
assert_contains "$out_plain" "→" "banner has migration arrow"
assert_contains "$out_plain" "Existing install detected" "banner header present"

echo "✓ L5.1 PASS — before/after diff will be preserved at $DIFF_PERSIST after cleanup"
