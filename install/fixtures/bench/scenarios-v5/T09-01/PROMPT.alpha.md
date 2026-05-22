Review `src/code.go` for concurrency/race conditions. Specifically look for **lost-update**. Subtlety level: low.

End with: ```json
{ "bug_class": "lost-update" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>" }
```

Prose ≤ 200 words.
