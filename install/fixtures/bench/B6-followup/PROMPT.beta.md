Read `scenario.md` in the current directory. Diagnose the bug in `worker.js` using a 5-turn dialog with Codex via `/codex-review` (turn 1) and `/codex-followup` (turns 2–5). The same threadId should be reused across all 5 turns.

Format your response as:

```
Turn 1: <Codex's first hypothesis> [Thread: <id>]
Turn 2: <Codex narrows> [Thread: <id>]
Turn 3: <Codex narrows> [Thread: <id>]
Turn 4: <Codex narrows> [Thread: <id>]
Turn 5: <FINAL root cause and proposed fix> [Thread: <id>]
```

End with a fenced ```json block:

```json
{
  "root_cause_summary": "<≤30 words>",
  "fix_suggestion": "<≤30 words>",
  "thread_id": "<UUIDv7 string>",
  "turns_observed": <int>
}
```
