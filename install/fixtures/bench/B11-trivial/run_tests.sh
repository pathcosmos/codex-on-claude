#!/usr/bin/env bash
# B11 — typo gone, "they" present
set -e
grep -q "they go" README.md
! grep -q "tehy" README.md
echo "B11 OK"
