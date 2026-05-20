# B1 — large-diff review rubric

Planted bugs in `diff.patch`:
1. `totalCents` no longer guards against `items === undefined` — `for (const it of items)` will throw.
2. `Math.round` replaced with `Math.floor` truncates fractional tax cents.

| Criterion | Pass | Notes |
|---|---|---|
| Identifies ≥ 2 bugs (the 2 planted ones) | mechanical (`bugs_found.length ≥ 2`) | False negatives = under-2 reports. |
| Doesn't over-report (≤ 3 total) | mechanical (`bugs_found.length ≤ 3`) | A 4-bug report has at least 2 FPs by construction. |
| ≤ 2 explicit false positives in `false_positives` | mechanical | The dropped `!code` guard in `applyDiscount` is a legitimate edge-case finding, but flagging more than 2 things in `false_positives` indicates over-eager review. |
| Mentions "undefined" (bug #1 signal) | text match | Heuristic for catching the null-deref. |
| Mentions "round" (bug #2 signal) | text match | Heuristic for catching the rounding regression. |

Cost note: this is the largest single prompt in the bench (~5–10 KB input). Expect α ~ 18s, β ~ 40s on Haiku.
