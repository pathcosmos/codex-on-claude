#!/usr/bin/env bash
# Single-arm benchmark runner.
#   ./run.sh <scenario> <alpha|beta>
# Honors $TS for the run-id namespace (default: UTC timestamp).
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <scenario> <alpha|beta>" >&2
  exit 2
fi

SCEN="$1"
ARM="$2"
case "$ARM" in alpha|beta) ;; *) echo "arm must be alpha|beta, got: $ARM" >&2; exit 2;; esac

ROOT="$(git rev-parse --show-toplevel)"
FX="$ROOT/install/fixtures/bench/$SCEN"
[ -d "$FX" ] || { echo "scenario dir not found: $FX" >&2; exit 2; }

PROMPT="$FX/PROMPT.$ARM.md"
[ -f "$PROMPT" ] || { echo "prompt not found: $PROMPT" >&2; exit 2; }

TS="${TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT="$ROOT/install/fixtures/bench/_runs/$TS/$SCEN/$ARM"
mkdir -p "$OUT"

WORK="$OUT/workspace"
if [ -d "$FX/src" ]; then
  cp -R "$FX/src" "$WORK"
  ( cd "$WORK" && git init -q && \
      git -c user.email=b@b -c user.name=bench add -A && \
      git -c user.email=b@b -c user.name=bench commit -q -m pre ) || true
else
  mkdir -p "$WORK"
fi

START=$(date +%s)
# bypassPermissions: the workspace is an isolated git scratch dir, so auto-approving
# Edit/Write/Bash/MCP calls is safe and necessary (dontAsk would deny everything
# not explicitly allowlisted, and an allowlist would have to enumerate per-arm tools).
( cd "$WORK" && \
    claude -p --model haiku --output-format stream-json --verbose \
      --permission-mode bypassPermissions \
      "$(cat "$PROMPT")" \
      > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt" ) || \
    echo "[run.sh] claude -p exited non-zero (recorded as failure)" >&2
END=$(date +%s)
echo "{\"wall_s\": $((END-START)), \"started\": $START, \"ended\": $END}" > "$OUT/timing.json"

# --- Post-run artifact capture ------------------------------------------------

# Claude-side usage (sum of message.usage fields)
jq -c 'select(.message.usage) | .message.usage' "$OUT/stream.jsonl" 2>/dev/null \
  | jq -s 'reduce .[] as $u ({}; .input_tokens += ($u.input_tokens // 0)
                                | .output_tokens += ($u.output_tokens // 0)
                                | .cache_read_input_tokens += ($u.cache_read_input_tokens // 0)
                                | .cache_creation_input_tokens += ($u.cache_creation_input_tokens // 0))' \
  > "$OUT/cost.json"

# tool_use events extracted into a flat jsonl
jq -c 'select(.type=="assistant")
       | (.message.content // [])[]?
       | select(.type=="tool_use")
       | {name, input}' "$OUT/stream.jsonl" 2>/dev/null \
  > "$OUT/tool_calls.jsonl" || true

# Codex-side usage estimation (sum char-length of mcp__codex__codex* responses ÷ 4)
# Only count tool_result events that pair with codex MCP calls — use tool_calls.jsonl as the filter.
jq -c 'select(.type=="user")
       | (.message.content // [])[]?
       | select(.type=="tool_result")
       | (.content // [])
       | (if type=="array" then map(.text // "") | add else (. // "") end)
       | {response_chars: ((. // "") | length)}' "$OUT/stream.jsonl" 2>/dev/null \
  | jq -s 'reduce .[] as $r ({tokens_est: 0}; .tokens_est += (($r.response_chars // 0) / 4 | floor))
           | . + {estimated: true, note: "char/4 heuristic — accurate ±30%; counts ALL tool_results, not just codex"}' \
  > "$OUT/cost.codex.json"

# Filesystem diff captured for edit scenarios
if [ -d "$WORK/.git" ]; then
  ( cd "$WORK" && git add -A && git diff --cached --stat > "$OUT/changed.files.txt" \
      && git diff --cached > "$OUT/changed.diff" ) || true
fi

# Optional test harness (fixture provides run_tests.sh)
if [ -f "$FX/run_tests.sh" ]; then
  ( cd "$WORK" && bash "$FX/run_tests.sh" > "$OUT/tests.txt" 2>&1 ) && echo 0 > "$OUT/tests.exit" \
      || echo "$?" > "$OUT/tests.exit"
fi

# Rubric scoring
node "$ROOT/install/fixtures/bench/score.mjs" "$SCEN" "$OUT" || \
    echo "[run.sh] score.mjs exited non-zero — result.json may be incomplete" >&2

echo "[$SCEN/$ARM] done — wrote $OUT"
