# D1 — doc writing + self-review loop rubric

## What's tested

α (Claude-only) drafts the doc in one shot. β (Claude + Codex) drafts then iterates twice via `/codex-review`.

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| All 5 sections present | mechanical (`doc_section_exists`) | Description / How to invoke / Guardrails / MUST procedures / Edge cases. |
| No `TBD`/`TODO`/`[...]` placeholders | mechanical | Doc must be self-contained. |
| `sections_authored` ≥ 5 items | mechanical | Trailing JSON block honesty check. |
| Word count ≤ 700 | mechanical | Conciseness gate. |
| Mentions `refill` | mechanical | Substantive coverage of the throttle mechanism. |
| β only: ≥ 2 `mcp__codex__codex` calls | mechanical | Confirms self-review loop actually ran. |

## Expected outcome

β should pass all criteria (loop catches missing edge cases). α may pass 6/8 — Haiku without iteration often skips Guardrails or stops at fewer edge cases. Synergy verdict: β-win if quality lift > 0.01pp and β cost < 2× α.
