Review `src/code.go` for concurrency/race conditions. Specifically look for **stale-read-snapshot**. Subtlety level: medium.

End with: ```json
{ "bug_class": "stale-read-snapshot" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>" }
```

Prose ≤ 200 words.
