Review the PR diff in `diff.patch`. Call `/codex-review` (or `mcp__codex__codex` read-only) ONCE with an adversarial framing: explicitly ask Codex to "find blockers AND subtle correctness bugs that follow from the diff, not just what's in it". Then output your merge decision.

There are at least 2 review-worthy issues.

End with a fenced ```json block:

```json
{ "issues_found": [{"severity": "blocker"|"nit", "summary": "<≤25 words>"}, ...], "merge_recommendation": "block"|"approve-with-changes"|"approve", "revision_rounds_proposed": <int>, "codex_thread_id": "<uuid>", "round1_findings": <int>, "round2_findings": <int> }
```

Set `round2_findings` to 0 since this treatment uses only a single round.

Prose ≤ 300 words.
