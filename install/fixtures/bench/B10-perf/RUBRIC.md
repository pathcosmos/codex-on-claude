# B10 — perf optimization rubric

| Criterion | Pass | Notes |
|---|---|---|
| Tests still pass | mechanical | Functional equivalence after the rewrite. |
| Only `slow.py` modified | mechanical | No collateral edits. |
| Diagnoses before-complexity as O(n²) family | mechanical | Forces structured analysis. |
| Proposes after-complexity O(n) or O(n log n) | mechanical | Anything worse is not a win. |
