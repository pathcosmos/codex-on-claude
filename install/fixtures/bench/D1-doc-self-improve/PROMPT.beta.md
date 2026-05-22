Read `throttle.js` and author a complete SKILL.md-style document for it via this self-review loop:

1. Write a first draft covering: `## Description`, `## How to invoke`, `## Guardrails`, `## MUST procedures`, `## Edge cases`.
2. Call `/codex-review` on the draft. Ask Codex to identify any missing edge cases, unclear wording, or contradictions.
3. Revise the draft, incorporating Codex's findings.
4. Call `/codex-review` ONE more time on the revised draft to confirm no remaining blockers.
5. Output the final revised document.

End the final document with a fenced ```json block:

```json
{ "sections_authored": ["Description", "How to invoke", "Guardrails", "MUST procedures", "Edge cases"], "word_count": <int>, "review_rounds": 2 }
```

Do NOT include `TBD`, `TODO`, or `[...]` placeholders. Prose ≤ 600 words total.
