Run the TDD cycle via Codex chain:

1. Call `/codex-fix` (or `mcp__codex__codex` with `sandbox=workspace-write` allowlist=['stack.js']) to implement `stack.js` per `spec.md` to pass all tests in `stack.test.js`.
2. Call `/codex-followup` on the same thread to ask Codex which 2 edge cases the current test suite is missing.
3. Apply Codex's suggested edge cases by appending to `stack.test.js`.
4. Run `node stack.test.js` to verify all pass.

End with a fenced ```json block:

```json
{ "tests_pass": true, "tests_added": <int>, "implementation_lines": <int>, "codex_thread_id": "<uuid>", "edge_cases_from_codex": ["...", "..."] }
```

Prose ≤ 200 words.
