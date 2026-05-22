Triage and fix the failing test via this chain:

1. Call `/codex-review` (or `mcp__codex__codex` with `sandbox=read-only`) on `buggy.js` + `buggy.test.js` to diagnose the bug. Capture Codex's thread ID.
2. Call `/codex-fix` (or `mcp__codex__codex` with `sandbox=workspace-write` and file allowlist=['buggy.js']) to apply the patch. Reuse the thread ID from step 1.
3. Call `/codex-followup` on the same thread to ask Codex to confirm the fix is complete and predict any remaining edge cases.
4. Run `node buggy.test.js` to verify.

End with a fenced ```json block:

```json
{ "bug_summary": "<≤20 words>", "files_changed": ["buggy.js"], "tests_pass": true, "codex_thread_id": "<uuid>", "review_done": true, "fix_done": true, "followup_done": true }
```

Prose ≤ 200 words.
