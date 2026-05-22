# D2 — reasoning depth rubric

## What's tested

A constraint puzzle (modified N-queens, 4 stacked constraints) hard enough that Haiku-driver alone often produces a placement that violates 1-2 constraints. β invokes Codex at `reasoning=high` to do the heavy search.

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| Exactly 6 queens in JSON | mechanical | Under/over-reporting fails. |
| All 4 constraints hold | mechanical (run_tests.sh) | Non-attacking + no forbidden squares + parity + ≥4 light squares. |
| Mentions "parity" and "forbidden" | mechanical | Substance check — model engaged with the rules. |
| β: ≥1 Codex call | mechanical | β actually invoked Codex. |

## Expected outcome

α may produce non-attacking + parity-satisfying but miss the light-square count, or vice versa. β with `reasoning=high` should pass all. Verdict β-strict-win if α fails tests_pass while β passes.

## Known valid solution (one of several)

`[[0, 2], [1, 5], [2, 1], [4, 6], [5, 0], [6, 4]]` — Σr=18, Σc=18, no diagonal conflicts, no forbidden squares, light count = 4 (positions (0,2), (2,1)?, (4,6), (6,4) — check parities). Adjust verifier-side if your solver finds a cleaner one.
