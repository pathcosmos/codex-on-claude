#!/usr/bin/env bash
# v2-fix: Parse queens from stream.jsonl's last fenced ```json block (run_tests.sh runs
# BEFORE score.mjs writes result.json, so we can't rely on result.json here).
# Verifies the 4 stacked constraints: non-attacking, no forbidden squares, parity, ≥4 light.
set -euo pipefail

# Find stream.jsonl. CWD = $OUT/workspace. stream.jsonl is at $OUT/stream.jsonl.
STREAM=""
for path in ../stream.jsonl ../../stream.jsonl ../../../stream.jsonl; do
  if [ -f "$path" ]; then STREAM="$path"; break; fi
done
if [ -z "$STREAM" ]; then echo "FAIL: stream.jsonl not found"; exit 1; fi

# Extract the last assistant text containing a fenced ```json block, then extract queens.
FINAL_TEXT=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text // empty' "$STREAM" 2>/dev/null | tr '\n' '\f' | awk -v RS='\f' '{ acc = acc $0 "\n" } END { print acc }')
# Find LAST fenced ```json block
QUEENS_RAW=$(printf '%s' "$FINAL_TEXT" | awk '
  /```json/ { in_block=1; buf=""; next }
  /```/ && in_block { last_block=buf; in_block=0; next }
  in_block { buf = buf $0 "\n" }
  END { print last_block }
' 2>/dev/null)

if [ -z "$QUEENS_RAW" ]; then echo "FAIL: no fenced \`\`\`json block in final assistant text"; exit 1; fi

# Parse queens from the JSON block
QUEENS=$(printf '%s' "$QUEENS_RAW" | jq -c '.queens // []' 2>/dev/null || echo "[]")
COUNT=$(echo "$QUEENS" | jq 'length' 2>/dev/null || echo "0")

if [ "$COUNT" != "6" ]; then echo "FAIL: expected 6 queens, got $COUNT (queens=$QUEENS)"; exit 1; fi

# Convert to bash arrays
ROWS=$(echo "$QUEENS" | jq -r '.[][0]' | tr '\n' ' ')
COLS=$(echo "$QUEENS" | jq -r '.[][1]' | tr '\n' ' ')
R=($ROWS)
C=($COLS)

# Check 1: non-attacking + valid bounds
for i in 0 1 2 3 4 5; do
  if [ "${R[$i]}" -lt 0 ] || [ "${R[$i]}" -gt 7 ] || [ "${C[$i]}" -lt 0 ] || [ "${C[$i]}" -gt 7 ]; then
    echo "FAIL: out-of-bounds queen at index $i: (${R[$i]},${C[$i]})"; exit 1
  fi
  for j in 0 1 2 3 4 5; do
    if [ "$i" -ge "$j" ]; then continue; fi
    if [ "${R[$i]}" = "${R[$j]}" ]; then echo "FAIL: same row: $i,$j"; exit 1; fi
    if [ "${C[$i]}" = "${C[$j]}" ]; then echo "FAIL: same col: $i,$j"; exit 1; fi
    DR=$(( ${R[$i]} - ${R[$j]} ))
    DC=$(( ${C[$i]} - ${C[$j]} ))
    if [ "${DR#-}" = "${DC#-}" ]; then echo "FAIL: diagonal attack $i,$j"; exit 1; fi
  done
done

# Check 2: forbidden squares
FORBIDDEN="0,0 0,7 7,0 7,7 3,3 3,4 4,3 4,4"
for i in 0 1 2 3 4 5; do
  POS="${R[$i]},${C[$i]}"
  for f in $FORBIDDEN; do
    if [ "$POS" = "$f" ]; then echo "FAIL: queen on forbidden $POS"; exit 1; fi
  done
done

# Check 3: parity (Σr == Σc)
SR=0; SC=0
for i in 0 1 2 3 4 5; do SR=$((SR + ${R[$i]})); SC=$((SC + ${C[$i]})); done
if [ "$SR" != "$SC" ]; then echo "FAIL: parity Σr=$SR Σc=$SC"; exit 1; fi

# Check 4: at least 4 on light squares ((r+c) % 2 == 0)
LIGHT=0
for i in 0 1 2 3 4 5; do
  if [ $(( ( ${R[$i]} + ${C[$i]} ) % 2 )) = "0" ]; then LIGHT=$((LIGHT+1)); fi
done
if [ "$LIGHT" -lt 4 ]; then echo "FAIL: only $LIGHT light queens (need ≥4)"; exit 1; fi

echo "OK: all 4 constraints satisfied (parity=$SR, light=$LIGHT, queens=$QUEENS)"
exit 0
