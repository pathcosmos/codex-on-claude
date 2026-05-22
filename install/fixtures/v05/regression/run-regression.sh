#!/usr/bin/env bash
# L5 regression driver — runs File 1 (v0.4.1 → v0.5.0 silent upgrade scenario)
# and File 2 (hook payload compatibility node:test) in sequence, prints a
# PASS/FAIL summary, exits non-zero on any failure.
#
# The two children are deliberately spawned in their own subshells with their
# own isolated $HOME (via the installer-flow helpers + node:test fixtures), so
# real user state is never touched.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source helpers only so users get a friendly error if jq is missing.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../installer-flow/helpers.sh"

REAL_HOME_AT_SOURCE="${REAL_HOME_AT_SOURCE:-$HOME}"
export REAL_HOME_AT_SOURCE

PASS=0
FAIL=0
FAILED_NAMES=()
FAILED_ERR_FILES=()

TMP_ERR_DIR="$(mktemp -d -t coc-regression-stderr-XXXXXX)"
cleanup_driver() {
  rm -rf "$TMP_ERR_DIR"
}
trap 'cleanup_driver' EXIT
trap 'echo "[run-regression] interrupted"; exit 130' INT TERM

run_step() {
  local name="$1"
  shift
  echo ""
  echo "======================================================================="
  echo "▶ $name"
  echo "======================================================================="
  local err_file="$TMP_ERR_DIR/$name.err"
  ( "$@" ) 2> >(tee "$err_file" >&2)
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "── PASS: $name"
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=( "$name" )
    FAILED_ERR_FILES+=( "$err_file" )
    echo "── FAIL: $name (exit $rc)"
  fi
}

# Step 1 — v0.4.1 → v0.5.0 upgrade shell scenario.
run_step "01-v041-upgrade.sh" bash "$SCRIPT_DIR/01-v041-upgrade.sh"

# Step 2 — node:test hook payload compatibility unit tests.
run_step "02-hook-payload-compat.test.mjs" node --test "$SCRIPT_DIR/02-hook-payload-compat.test.mjs"

echo ""
echo "======================================================================="
echo "REGRESSION: PASS $PASS / FAIL $FAIL"
echo "======================================================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed steps:"
  i=0
  while [ "$i" -lt "${#FAILED_NAMES[@]}" ]; do
    echo "  - ${FAILED_NAMES[$i]}"
    i=$((i + 1))
  done
  echo ""
  echo "First failing stderr excerpt:"
  echo "--- ${FAILED_NAMES[0]} ---"
  tail -40 "${FAILED_ERR_FILES[0]}" 2>/dev/null || echo "(no stderr captured)"
  echo "--- end ---"
  exit 1
fi

exit 0
