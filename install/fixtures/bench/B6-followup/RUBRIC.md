# B6 — followup 5-turn rubric

| Criterion | Pass | Notes |
|---|---|---|
| Final answer mentions "duplicate" | mechanical | Root cause signal. |
| Final answer mentions "even" | mechanical | Signal that the `id % 2 === 0` branch was identified. |
| `root_cause_summary` present in JSON | mechanical | Structured commitment. |
| `fix_suggestion` present in JSON | mechanical | Structured commitment. |
| β invoked `mcp__codex__codex-reply` ≥ 3 times | mechanical | Confirms followup loop on β (turn 1 = codex, turns 2–5 = codex-reply). |
| (manual) Same threadId across all β replies | inspect `tool_calls.jsonl` | The `mcp__codex__codex-reply` invocations should carry one and only one threadId. |

Expected: β wins on structured iterative debugging; α may give the right answer in one shot but the "5-turn" structure on α is theatre.
