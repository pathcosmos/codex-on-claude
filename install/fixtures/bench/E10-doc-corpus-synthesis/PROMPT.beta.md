There are 6 service docs (`*-service.md`). Delegate the synthesis to `codex-reviewer` subagent OR `mcp__codex__codex` with `sandbox=read-only`. Do NOT read all 6 files into your main context yourself.

Synthesis output should cover:
1. **Service map**: each service's purpose in 1 sentence
2. **Dependency graph**: who depends on whom
3. **Cross-cutting concerns**: failure modes, SLO patterns, common storage
4. **Top 3 architectural risks**

End with a fenced ```json block:

```json
{ "services": ["auth", "orders", "inventory", "payments", "shipping", "audit"], "dependencies": [{"from": "<svc>", "to": "<svc>"}, ...], "top_risks": ["<≤25 words>", "<≤25 words>", "<≤25 words>"], "synthesis_done": true, "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 500 words.
