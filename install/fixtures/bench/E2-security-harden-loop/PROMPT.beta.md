Audit + harden `vulnerable.js` via this loop:

1. Round 1 — `/codex-review` audit (sandbox=read-only) to identify all issues. Capture thread ID.
2. Apply Codex's recommended fixes to `vulnerable.js` directly OR via `/codex-fix` (sandbox=workspace-write, allowlist=['vulnerable.js']). Reuse thread ID.
3. Round 2 — `/codex-review` (or `/codex-followup` on same thread) to confirm zero remaining issues.

End with a fenced ```json block:

```json
{ "findings": [{"category": "sqli"|"xss"|"timing"|"other", "summary": "<≤25 words>"}, ...], "fixes_applied": <int>, "remaining_issues": <int>, "review_rounds": 2, "codex_thread_id": "<uuid>" }
```

Prose ≤ 250 words.
