Review `src/code.go` for concurrency bugs via `mcp__codex__codex` with **reasoning=high**. Look for **stale-read-snapshot**.

End with: ```json
{ "bug_class": "stale-read-snapshot" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>", "codex_consulted": true, "reasoning_level": "high" }
```

Prose ≤ 200 words.
