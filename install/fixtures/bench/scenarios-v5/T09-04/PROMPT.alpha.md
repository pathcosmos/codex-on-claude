Review `src/code.go` for concurrency/race conditions. Specifically look for **deadlock-acquire-order**. Subtlety level: high.

End with: ```json
{ "bug_class": "deadlock-acquire-order" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>" }
```

Prose ≤ 200 words.
