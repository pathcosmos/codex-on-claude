#!/usr/bin/env bash
# γ arm runner — Codex CLI direct (no Claude wrapper).
#   ./run-gamma.sh <scenario>
# Reads PROMPT.beta.md (same task as β, but executed by codex exec directly).
# Honors $TS for run-id namespace.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <scenario>" >&2
  exit 2
fi

SCEN="$1"
ARM="gamma"

ROOT="$(git rev-parse --show-toplevel)"
FX="$ROOT/install/fixtures/bench/$SCEN"
[ -d "$FX" ] || { echo "scenario dir not found: $FX" >&2; exit 2; }

PROMPT="$FX/PROMPT.beta.md"
[ -f "$PROMPT" ] || { echo "prompt not found: $PROMPT" >&2; exit 2; }

TS="${TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT="$ROOT/install/fixtures/bench/_runs/$TS/$SCEN/$ARM"
mkdir -p "$OUT"

WORK="$OUT/workspace"
if [ -d "$FX/src" ]; then
  cp -R "$FX/src" "$WORK"
else
  mkdir -p "$WORK"
fi

START=$(date +%s)
# Codex CLI direct execution. read-only sandbox, JSON stream for parseable output.
# Model + reasoning via -c overrides (subscription-aware).
# CRITICAL: `< /dev/null` closes stdin — without it, codex CLI sees inherited stdin
# from parent and waits forever for "additional input from stdin".
( cd "$WORK" && \
    codex exec \
      --sandbox read-only \
      --skip-git-repo-check \
      --json \
      -c model_reasoning_effort=high \
      -o "$OUT/final_message.txt" \
      "$(cat "$PROMPT")" \
      < /dev/null \
      > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt" ) || \
    echo "[run-gamma.sh] codex exec exited non-zero (recorded as failure)" >&2
# Note: -m flag omitted intentionally. ChatGPT-account auth defaults to a compatible model
# (e.g., gpt-5-mini or whatever the subscription tier allows). Explicit -m gpt-5 or gpt-5-codex
# is rejected as "not supported when using Codex with a ChatGPT account".
END=$(date +%s)
echo "{\"wall_s\": $((END-START)), \"started\": $START, \"ended\": $END}" > "$OUT/timing.json"

# γ side has no Claude cache stats; cost.json is empty for compatibility
echo '{"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0, "note": "γ arm — no Claude driver, see cost.codex.json"}' > "$OUT/cost.json"

# Codex token estimation: use the final message length as proxy
if [ -f "$OUT/final_message.txt" ]; then
  CHARS=$(wc -c < "$OUT/final_message.txt" | tr -d ' ')
  TOKEN_EST=$((CHARS / 4))
  echo "{\"tokens_est\": $TOKEN_EST, \"samples\": 1, \"response_chars_total\": $CHARS, \"estimated\": true, \"source\": \"char/4 of final_message.txt (γ arm)\"}" > "$OUT/cost.codex.json"
else
  echo '{"tokens_est": 0, "samples": 0, "response_chars_total": 0, "estimated": true, "source": "γ arm — no final_message.txt"}' > "$OUT/cost.codex.json"
fi

# Tool result sizes — N/A for γ (no tool_results in the Claude sense)
echo '{"count": 0, "p50": 0, "p95": 0, "max": 0, "sum": 0, "note": "γ arm — no tool_results"}' > "$OUT/tool_result_sizes.json"

# Synthesize a tool_calls.jsonl with single entry for codex direct
echo '{"name": "codex_exec_direct", "input": {"sandbox": "read-only", "reasoning": "high"}}' > "$OUT/tool_calls.jsonl"

# Filesystem diff captured for edit scenarios (γ might have written files in workspace-write mode, but here read-only)
if [ -d "$WORK/.git" ]; then
  ( cd "$WORK" && git add -A && git diff --cached --stat > "$OUT/changed.files.txt" \
      && git diff --cached > "$OUT/changed.diff" ) || true
else
  echo "no git in workspace" > "$OUT/changed.files.txt"
fi

# Optional test harness (if scenario has run_tests.sh) — works the same as α/β
if [ -f "$FX/run_tests.sh" ]; then
  ( cd "$WORK" && bash "$FX/run_tests.sh" > "$OUT/tests.txt" 2>&1 ) && echo 0 > "$OUT/tests.exit" \
      || echo "$?" > "$OUT/tests.exit"
fi

# Synthesize a stream.jsonl-compatible result for score.mjs
# The final assistant text is the Codex final_message.
# Wrap it as a fake assistant event so extractFinalAssistantText works.
if [ -f "$OUT/final_message.txt" ]; then
  MSG=$(cat "$OUT/final_message.txt")
  # Append a fake event compatible with score.mjs's parser
  printf '{"type":"assistant","message":{"content":[{"type":"text","text":%s}]}}\n' "$(printf '%s' "$MSG" | jq -Rs .)" >> "$OUT/stream.jsonl"
fi

# Run score.mjs
node "$ROOT/install/fixtures/bench/score.mjs" "$SCEN" "$OUT" || \
    echo "[run-gamma.sh] score.mjs exited non-zero — result.json may be incomplete" >&2

echo "[$SCEN/$ARM] done — wrote $OUT"
