#!/usr/bin/env bash
# Full bench matrix: N=1 for all 12 scenarios, N=3 for the 3 core scenarios.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/install/fixtures/bench"

RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
CORE=(B1-large-diff B5-secaudit B6-followup)

ALL=(B1-large-diff B2-refactor B3-bugfix B4-testgen B5-secaudit B6-followup \
     B7-arch B8-spec B9-hostile B10-perf B11-trivial B12-trap)

is_core() {
  local s="$1"
  for c in "${CORE[@]}"; do [ "$c" = "$s" ] && return 0; done
  return 1
}

for s in "${ALL[@]}"; do
  reps=1
  if is_core "$s"; then reps=3; fi
  for r in $(seq 1 "$reps"); do
    for arm in alpha beta; do
      echo "=== $s / $arm / run$r ==="
      TS="$RUN_ID/run$r" ./run.sh "$s" "$arm" || true
    done
  done
done

node report.mjs "$RUN_ID" > "_runs/$RUN_ID/report.md"
echo "Report: _runs/$RUN_ID/report.md"
