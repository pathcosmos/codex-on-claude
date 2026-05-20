Review the diff at `diff.patch` in the current directory using `/codex-review`. It modifies `order.js`. There are exactly 2 functional bugs introduced.

End with a fenced ```json block matching the α schema:

```json
{
  "bugs_found": [
    {"id": "B1" | ..., "line_hint": <int>, "description": "<≤30 words>"}
  ],
  "false_positives": [ ... ]
}
```

Prose ≤ 250 words.
