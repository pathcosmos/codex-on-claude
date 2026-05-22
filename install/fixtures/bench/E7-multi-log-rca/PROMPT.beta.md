There are 3 log files (`db.log`, `cache.log`, `api.log`) totaling ~58KB. Delegate the RCA to `codex-reviewer` subagent (or `mcp__codex__codex` read-only). Do NOT ingest the logs into your main context yourself.

End with a fenced ```json block:

```json
{ "root_cause_layer": "db" | "cache" | "api" | "other", "cascade_chain": ["...", "...", "..."], "error_categories": <int>, "remediation_priority": ["...", "...", "..."], "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 350 words.
