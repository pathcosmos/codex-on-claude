Review `src/code.rs` for concurrency/race conditions. Specifically look for **shared-mutable-state**. Subtlety level: low.

End with: ```json
{ "bug_class": "shared-mutable-state" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>" }
```

Prose ≤ 200 words.
