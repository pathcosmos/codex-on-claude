#!/usr/bin/env bash
# L3.9 — Reconfigure that only changes usageMode must NOT clobber existing
# subscription / model fields.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home
trap cleanup_home EXIT

echo "▶ L3.9: reconfigure preserves subscription + model"

# Fresh install with explicit subscription/model selections.
coc --usage-mode=synergy \
    --patterns=review,followup --context-policy=mixed --improvement-loop=manual --threads=basic \
    --subscription-claude=pro --subscription-codex=plus \
    --codex-model-primary=gpt-5.5 --codex-reasoning-primary=high \
    --reviewer-model-primary=opus --reviewer-reasoning-primary=high \
    --yes >/dev/null 2>&1 || { echo "✗ install failed" >&2; exit 1; }

config="$HOME/.claude/codex-on-claude/config.json"
sub_claude_pre="$(json_get "$config" '.choices.subscription.claude')"
sub_codex_pre="$(json_get "$config" '.choices.subscription.codex')"
codex_primary_pre="$(json_get "$config" '.choices.model.codex.primary.id')"
codex_reasoning_pre="$(json_get "$config" '.choices.model.codex.primary.reasoning')"
reviewer_primary_pre="$(json_get "$config" '.choices.model.reviewer.primary.id')"
reviewer_reasoning_pre="$(json_get "$config" '.choices.model.reviewer.primary.reasoning')"

# Now reconfigure flipping only usageMode.
coc reconfigure --usage-mode=max --yes >/dev/null 2>&1 || { echo "✗ reconfigure failed" >&2; exit 1; }

sub_claude_post="$(json_get "$config" '.choices.subscription.claude')"
sub_codex_post="$(json_get "$config" '.choices.subscription.codex')"
codex_primary_post="$(json_get "$config" '.choices.model.codex.primary.id')"
codex_reasoning_post="$(json_get "$config" '.choices.model.codex.primary.reasoning')"
reviewer_primary_post="$(json_get "$config" '.choices.model.reviewer.primary.id')"
reviewer_reasoning_post="$(json_get "$config" '.choices.model.reviewer.primary.reasoning')"

assert_eq "$sub_claude_pre" "$sub_claude_post" "subscription.claude preserved"
assert_eq "$sub_codex_pre" "$sub_codex_post" "subscription.codex preserved"
assert_eq "$codex_primary_pre" "$codex_primary_post" "codex.primary.id preserved"
assert_eq "$codex_reasoning_pre" "$codex_reasoning_post" "codex.primary.reasoning preserved"
assert_eq "$reviewer_primary_pre" "$reviewer_primary_post" "reviewer.primary.id preserved"
assert_eq "$reviewer_reasoning_pre" "$reviewer_reasoning_post" "reviewer.primary.reasoning preserved"

# And confirm usageMode actually changed.
mode="$(json_get "$config" '.choices.usageMode')"
assert_eq "max" "$mode" "usageMode flipped to max"

echo "✓ L3.9 PASS"
