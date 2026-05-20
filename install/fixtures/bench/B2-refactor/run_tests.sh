#!/usr/bin/env bash
# B2: every getUser reference must be gone; loadUser must appear in all 4 files.
set -e
if grep -rn "getUser" .; then
  echo "B2 FAIL: residual getUser references"
  exit 1
fi
for f in a.js b.js c.js userlib.js; do
  grep -q "loadUser" "$f" || { echo "B2 FAIL: $f missing loadUser"; exit 1; }
done
echo "B2 OK"
