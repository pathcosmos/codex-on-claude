# E1 — bug-triage-pipeline rubric

## What's tested

Multi-Skill chain: `/codex-review` (diagnose) → `/codex-fix` (patch) → `/codex-followup` (verify). α: direct diagnosis-fix-verify in one Claude pass.

## Bug

`buggy.js:7` uses `i < arr.length - window` — should be `i <= arr.length - window` (off-by-one). Test `window=2` should produce 4 averages but gets 3.

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| tests_pass | mechanical (run_tests.sh) | All 4 assertions in buggy.test.js. |
| tests_pass JSON field | mechanical | Honesty check. |
| bug_summary present | mechanical | Forces explanation. |
| files_changed ≥ 1 | mechanical | Confirms edit happened. |
| Mentions "off" (off-by-one) | mechanical | Substance check. |
| β: ≥2 distinct mcp__codex__ calls | mechanical | Chain confirmed. |
| β: sequence of ≥2 codex calls in order | mechanical | Verifies review→fix or review→followup pattern. |

## Expected outcome

α should fix and pass tests in a single shot (Haiku is fine for off-by-one). β does same correctness via 3-step chain — same tests_pass but more cost. Likely β-redundant unless Codex catches something subtle in the followup.
