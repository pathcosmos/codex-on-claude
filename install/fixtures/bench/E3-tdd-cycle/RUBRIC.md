# E3 — tdd-cycle rubric

## What's tested

α implements + adds tests in one Claude pass. β uses `/codex-fix` for impl + `/codex-followup` to suggest edge cases. The key differentiator is β's edge-case-from-Codex (which a Haiku might not surface alone).

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| tests_pass (run_tests.sh) | mechanical | All assertions + 2+ added tests pass. |
| stack.js created in workspace | mechanical | final_state_has_files. |
| tests_pass JSON field | mechanical | Honesty. |
| tests_added field present | mechanical | Forces commitment. |
| Mentions "stack" | mechanical | Substance. |
| β: ≥1 mcp__codex__codex call | mechanical | Used the chain. |

## Expected outcome

Both arms should achieve tests_pass. β's edge cases tend to be more diverse (e.g., circular references, very deep stacks). α typically picks safe edge cases (null, mixed types).
