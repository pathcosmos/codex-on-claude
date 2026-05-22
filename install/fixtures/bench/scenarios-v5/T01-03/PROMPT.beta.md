Author the SKILL.md doc for `src/retry-backoff.go` via TWO-ROUND self-review:

1. Write first draft with 4 sections: `## Description`, `## How to invoke`, `## Guardrails`, `## MUST procedures`.
2. Call `/codex-review` to identify missing edge cases or unclear wording. Capture thread ID.
3. Revise based on findings.
4. Call `/codex-followup` on same thread to confirm no remaining issues.

End with: ```json
{ "sections_authored": ["Description", "How to invoke", "Guardrails", "MUST procedures"], "word_count": <int>, "review_rounds": 2 }
```

Prose ≤ 600 words.
