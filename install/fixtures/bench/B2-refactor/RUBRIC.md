# B2 — cross-file rename rubric

| Criterion | Pass | Notes |
|---|---|---|
| All `getUser` → `loadUser` renames applied | mechanical (`grep` in run_tests.sh checks no residual `getUser`) | Catches under-renames. |
| Exactly 4 files modified | mechanical | Under-4 = miss; over-4 = collateral damage. |
| Only the 4 known files modified | mechanical | Allowlist check. |

Expected: α should win (or tie) since this is a simple find-replace; β measures overhead.
