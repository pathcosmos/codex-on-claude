#!/usr/bin/env bash
# Full bench matrix: N=1 for all 12 (+ D1-D4) scenarios, N=3 for the 3 core scenarios.
# v0.4.2+: between-scenario thread/log reset (BENCH_ISOLATE=1) + D1-D4 inclusion.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/install/fixtures/bench"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
BENCH_ISOLATE="${BENCH_ISOLATE:-1}"  # set =0 to disable thread/log reset
INCLUDE_D="${INCLUDE_D:-1}"           # set =0 to skip D1-D4

CORE=(B1-large-diff B5-secaudit B6-followup)

ALL=(B1-large-diff B2-refactor B3-bugfix B4-testgen B5-secaudit B6-followup \
     B7-arch B8-spec B9-hostile B10-perf B11-trivial B12-trap)

if [ "$INCLUDE_D" = "1" ]; then
  for d in D1-doc-self-improve D2-reasoning-depth D3-token-efficiency D4-analyze-improve-loop; do
    [ -d "$ROOT/install/fixtures/bench/$d" ] && ALL+=("$d")
  done
fi

is_core() {
  local s="$1"
  for c in "${CORE[@]}"; do [ "$c" = "$s" ] && return 0; done
  return 1
}

reset_thread_state() {
  if [ "$BENCH_ISOLATE" = "1" ] && [ -n "${HOME:-}" ]; then
    rm -rf "$HOME/.claude/codex-on-claude/threads"/* 2>/dev/null || true
    rm -rf "$HOME/.claude/codex-on-claude/logs"/* 2>/dev/null || true
  fi
}

for s in "${ALL[@]}"; do
  reps=1
  if is_core "$s"; then reps=3; fi
  for r in $(seq 1 "$reps"); do
    reset_thread_state
    for arm in alpha beta; do
      echo "=== $s / $arm / run$r ==="
      TS="$RUN_ID/run$r" ./run.sh "$s" "$arm" || true
    done
  done
done

node report.mjs "$RUN_ID" > "_runs/$RUN_ID/report.md"
echo "Report: _runs/$RUN_ID/report.md"
