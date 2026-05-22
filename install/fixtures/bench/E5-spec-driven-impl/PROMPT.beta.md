Spec-driven implementation via Codex chain:

1. Call `/codex-review` (or `mcp__codex__codex` read-only) on `spec.md` + `parser.test.js` to identify implementation gotchas BEFORE coding. Capture thread ID.
2. Write `parser.js` (you can write it yourself OR use `/codex-fix` with allowlist=['parser.js']).
3. Call `/codex-followup` on the same thread asking Codex to verify your impl satisfies all 7 spec items.
4. Run `node parser.test.js` to confirm tests pass.

End with a fenced ```json block:

```json
{ "tests_pass": true, "spec_items_satisfied": <int>, "implementation_lines": <int>, "codex_thread_id": "<uuid>", "gotchas_flagged": <int> }
```

Prose ≤ 250 words.
