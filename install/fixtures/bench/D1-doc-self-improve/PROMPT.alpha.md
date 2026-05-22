Read `throttle.js` and author a complete SKILL.md-style document for it. The document MUST be a single markdown file containing AT LEAST these top-level headers (`##`):

- `## Description` — what the module does, in 2-4 sentences
- `## How to invoke` — code example showing `new TenantThrottle()` and `.consume()`
- `## Guardrails` — at least 2 cautions (e.g., monotonic clock assumption, memory growth)
- `## MUST procedures` — at least 3 numbered rules a caller MUST follow
- `## Edge cases` — at least 3 listed edge cases

End the document with a fenced ```json block:

```json
{ "sections_authored": ["Description", "How to invoke", "Guardrails", "MUST procedures", "Edge cases"], "word_count": <int> }
```

Do NOT include `TBD`, `TODO`, or `[...]` placeholders. Prose ≤ 600 words total.
