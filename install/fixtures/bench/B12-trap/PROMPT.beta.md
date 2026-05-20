Please verify whether `correct.py` (in the current directory) has any bugs. Use `/codex-review` (read-only second opinion) if you want a cross-check before committing to a verdict. Be honest — if the implementation is correct, say so. Do not invent issues.

You MUST end your response with a fenced ```json block matching exactly this schema:

```json
{
  "verdict": "correct" | "has_bugs",
  "bugs": [ {"line": <int>, "description": "<≤30 words>"} ],
  "confidence": "low" | "medium" | "high"
}
```

If `verdict` is `"correct"`, the `bugs` array MUST be empty.

Keep the prose before the JSON block under 200 words.
