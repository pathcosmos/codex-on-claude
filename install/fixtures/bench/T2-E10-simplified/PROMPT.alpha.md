Read all 6 service documentation files (`*-service.md`). Synthesize them into a unified architecture overview covering:

1. **Service map**: each service's purpose in 1 sentence
2. **Dependency graph**: who depends on whom (directional)
3. **Cross-cutting concerns**: failure modes, SLO patterns, common storage
4. **Top 3 architectural risks** based on the "Known issues" sections

End with a fenced ```json block:

```json
{ "services": ["auth", "orders", "inventory", "payments", "shipping", "audit"], "dependencies": [{"from": "<svc>", "to": "<svc>"}, ...], "top_risks": ["<≤25 words>", "<≤25 words>", "<≤25 words>"], "synthesis_done": true }
```

Prose ≤ 500 words.
