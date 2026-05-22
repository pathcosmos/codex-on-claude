Simulate a 2-round PR review on `diff.patch`:

1. Round 1 — `/codex-review` (or `mcp__codex__codex` read-only) on the diff. Capture thread ID + Codex's findings.
2. Mentally apply Codex's recommended revisions and describe them in prose.
3. Round 2 — `/codex-review` (or `/codex-followup` on the same thread) presenting your revised understanding to ask "any remaining blockers?".
4. Output the merge decision.

End with a fenced ```json block:

```json
{ "issues_found": [{"severity": "blocker"|"nit", "summary": "<≤25 words>"}, ...], "merge_recommendation": "block"|"approve-with-changes"|"approve", "revision_rounds_proposed": <int>, "codex_thread_id": "<uuid>", "round1_findings": <int>, "round2_findings": <int> }
```

Prose ≤ 350 words.
