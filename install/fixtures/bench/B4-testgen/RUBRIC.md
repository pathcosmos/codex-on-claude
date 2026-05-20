# B4 — test generation rubric

| Criterion | Pass | Notes |
|---|---|---|
| `calc.test.ts` created | mechanical (changed files ≥ 1) | Output produced. |
| No other file modified | mechanical (allowlist) | No collateral edits. |
| `npx tsx calc.test.ts` exits 0 | mechanical (`tests.exit == 0`) | Tests compile & pass. |
| (manual) ≥ 10/12 functions covered | inspect `calc.test.ts` | Coverage breadth. |
| (manual) ≥ 3 edge cases | inspect `calc.test.ts` | div-by-zero, empty array, negative, overflow. |

The mechanical checks are necessary but not sufficient — the count/coverage checks are deferred to manual inspection of the generated file.
