There are 6 service docs (`*-service.md`). Read all 6 files directly (do NOT delegate to a subagent — that path caused output format loss in prior tests). Synthesize into a unified architecture overview.

Cover:
1. Service map: each service's purpose in 1 sentence
2. Dependency graph
3. Cross-cutting concerns
4. Top 3 architectural risks

End with a fenced ```json block:

```json
{ "services": ["auth", "orders", "inventory", "payments", "shipping", "audit"], "dependencies": [{"from": "<svc>", "to": "<svc>"}, ...], "top_risks": ["<≤25 words>", "<≤25 words>", "<≤25 words>"], "synthesis_done": true, "delegated_to": "self" }
```

Prose ≤ 500 words.
