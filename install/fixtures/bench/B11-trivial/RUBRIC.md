# B11 — β-restraint rubric

| Criterion | Pass | Notes |
|---|---|---|
| Typo `tehy` → `they` fixed in `README.md` | mechanical (`run_tests.sh` greps for residual `tehy`) | Trivial fix; both arms expected to pass. |
| Only `README.md` was modified | mechanical (`changed.files.txt` ⊆ {README.md}) | No collateral edits. |
| β did NOT invoke `mcp__codex__codex` | mechanical (`tool_calls.jsonl` has 0 such entries) | The whole point of this scenario: restraint. |
| β did NOT invoke `mcp__codex__codex-reply` | mechanical | Same reason. |

α is expected to score 3/3 (the codex restraint criteria are n/a on α). β is expected to score 5/5 only if it shows restraint. β scoring < 5 indicates the bridge over-eagerly defers to Codex on trivial work.
