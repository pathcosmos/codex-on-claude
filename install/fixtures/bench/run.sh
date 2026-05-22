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

# Codex-side usage estimation (char/4 heuristic, ±30%).
# FIX (Phase 0.5): previously this counted ALL tool_results — Read/Bash/etc — inflating Codex tokens.
# Now we (1) extract tool_use IDs whose .name starts with mcp__codex__, then (2) filter tool_results by tool_use_id.
jq -r 'select(.type=="assistant")
       | (.message.content // [])[]?
       | select(.type=="tool_use" and (.name // "" | startswith("mcp__codex__")))
       | .id' "$OUT/stream.jsonl" 2>/dev/null | sort -u > "$OUT/.codex_ids.txt" || true

if [ -s "$OUT/.codex_ids.txt" ]; then
  jq -c --rawfile ids_raw "$OUT/.codex_ids.txt" \
    '($ids_raw | split("\n") | map(select(. != ""))) as $ids
     | select(.type=="user")
     | (.message.content // [])[]?
     | select(.type=="tool_result")
     | select(.tool_use_id as $tid | $ids | index($tid))
     | (.content // [])
     | (if type=="array" then map(.text // "") | add else (. // "") end)
     | {response_chars: ((. // "") | length)}' "$OUT/stream.jsonl" 2>/dev/null \
    | jq -s 'reduce .[] as $r ({tokens_est: 0, samples: 0, response_chars_total: 0};
                .tokens_est += (($r.response_chars // 0) / 4 | floor)
                | .samples += 1
                | .response_chars_total += ($r.response_chars // 0))
             | . + {estimated: true, source: "char/4 of mcp__codex__* tool_results only"}' \
    > "$OUT/cost.codex.json"
else
  echo '{"tokens_est": 0, "samples": 0, "response_chars_total": 0, "estimated": true, "source": "no codex tool_use events found"}' > "$OUT/cost.codex.json"
fi
rm -f "$OUT/.codex_ids.txt"

# Tool-result response size distribution (all tool_results — used by tool_call_response_size_p95 evaluator
# for D3 token-efficiency measurement of main-context bloat).
jq -c 'select(.type=="user")
       | (.message.content // [])[]?
       | select(.type=="tool_result")
       | (.content // [])
       | (if type=="array" then map(.text // "") | add else (. // "") end)
       | ((. // "") | length)' "$OUT/stream.jsonl" 2>/dev/null \
  | jq -s '. as $sizes
           | ($sizes | length) as $n
           | if $n == 0 then {count: 0, p50: 0, p95: 0, max: 0, sum: 0}
             else ($sizes | sort) as $sorted
                  | {count: $n,
                     p50: $sorted[($n * 50 / 100 | floor)],
                     p95: $sorted[($n * 95 / 100 | floor) | if . >= $n then $n - 1 else . end],
                     max: $sorted[-1],
                     sum: ($sizes | add)}
             end' \
  > "$OUT/tool_result_sizes.json" || echo '{"count":0,"p50":0,"p95":0,"max":0,"sum":0}' > "$OUT/tool_result_sizes.json"

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
