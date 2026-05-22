#!/usr/bin/env bash
# L3 installer-flow driver: runs every 01-12 scenario in its own subshell,
# each with a fresh isolated $HOME. Reports PASS / FAIL counts and exits
# non-zero if any scenario fails.
#
# Portability note: macOS ships bash 3.2, which lacks `declare -A`. We keep the
# bookkeeping plain (parallel arrays + temp files) so this driver works under
# /bin/bash without needing brew's bash.
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

REAL_HOME_AT_SOURCE="${REAL_HOME_AT_SOURCE:-$HOME}"
export REAL_HOME_AT_SOURCE

PASS=0
FAIL=0
FAILED_NAMES=()
FAILED_ERR_FILES=()

# Stable, lexicographic ordering — covers 01 … 12.
shopt -s nullglob
SCENARIOS=( "$SCRIPT_DIR"/[0-9][0-9]-*.sh )

if [ "${#SCENARIOS[@]}" -eq 0 ]; then
  echo "✗ No scenarios found in $SCRIPT_DIR" >&2
  exit 1
fi

# Top-level trap: clean up captured stderr files on exit.
TMP_ERR_DIR="$(mktemp -d -t coc-flow-stderr-XXXXXX)"
cleanup_driver() {
  rm -rf "$TMP_ERR_DIR"
}
trap 'cleanup_driver' EXIT
trap 'echo "[run-flow] interrupted"; exit 130' INT TERM

for scen in "${SCENARIOS[@]}"; do
  name="$(basename "$scen")"
  echo ""
  echo "======================================================================="
  echo "▶ $name"
  echo "======================================================================="
  err_file="$TMP_ERR_DIR/$name.err"
  # Run in a subshell so set -e / exits don't affect the driver.
  ( bash "$scen" ) 2> >(tee "$err_file" >&2)
  rc=$?
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "── PASS: $name"
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=( "$name" )
    FAILED_ERR_FILES+=( "$err_file" )
    echo "── FAIL: $name (exit $rc)"
  fi
done

echo ""
echo "======================================================================="
echo "INSTALLER-FLOW: PASS $PASS / FAIL $FAIL"
echo "======================================================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed scenarios:"
  i=0
  while [ "$i" -lt "${#FAILED_NAMES[@]}" ]; do
    echo "  - ${FAILED_NAMES[$i]}"
    i=$((i + 1))
  done
  echo ""
  echo "First failing stderr excerpt:"
  echo "--- ${FAILED_NAMES[0]} ---"
  tail -30 "${FAILED_ERR_FILES[0]}" 2>/dev/null || echo "(no stderr captured)"
  echo "--- end ---"
  exit 1
fi

exit 0
