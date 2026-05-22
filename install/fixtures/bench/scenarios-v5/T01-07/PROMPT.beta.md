Author the SKILL.md doc for `src/session-store.py` via TWO-ROUND self-review:

1. Write first draft with 5 sections: `## Description`, `## How to invoke`, `## Guardrails`, `## MUST procedures`, `## Edge cases`.
2. Call `/codex-review` to identify missing edge cases or unclear wording. Capture thread ID.
3. Revise based on findings.
4. Call `/codex-followup` on same thread to confirm no remaining issues.

End with: ```json
{ "sections_authored": ["Description", "How to invoke", "Guardrails", "MUST procedures", "Edge cases"], "word_count": <int>, "review_rounds": 2 }
```

Prose ≤ 600 words.
