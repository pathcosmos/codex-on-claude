#!/usr/bin/env bash
# B4: test file must execute cleanly.
set -e
[ -f calc.test.ts ] || { echo "B4 FAIL: calc.test.ts missing"; exit 1; }
if command -v npx >/dev/null 2>&1; then
  npx --yes tsx calc.test.ts
else
  echo "B4 SKIP: npx unavailable on this host" >&2
  exit 0  # don't penalize if tsx isn't installed
fi
