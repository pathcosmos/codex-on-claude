# E4 — pr-review-simulation rubric

## Issues to find

1. **Recency bug**: `set(key)` for existing key uses `map.set` directly — but Map's iteration order follows insertion. Calling `set` on existing key should `delete` first then `set` to refresh recency. (Same pattern as `get`.)
2. **Divide-by-zero in stats**: `this.hits / (this.hits + this.misses)` — if both are 0 on first call, returns NaN.

Bonus: stats() not snapshotted (caller can mutate).

## β chain

Round 1 review → revise → Round 2 confirm. ≥2 Codex calls required.
