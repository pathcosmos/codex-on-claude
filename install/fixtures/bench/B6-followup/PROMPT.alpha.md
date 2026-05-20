Read `scenario.md` in the current directory. Diagnose the bug in `worker.js` using a 5-turn self-dialog (no actual tools — just write 5 progressively narrower hypotheses, then commit to a root cause).

Format your response as:

```
Turn 1: <hypothesis>
Turn 2: <refinement>
Turn 3: <refinement>
Turn 4: <refinement>
Turn 5: <FINAL root cause and proposed fix>
```

End with a fenced ```json block:

```json
{
  "root_cause_summary": "<≤30 words>",
  "fix_suggestion": "<≤30 words>"
}
```
