TDD via Codex chain:

1. `/codex-fix` to implement `fraction-arithmetic.py` to pass all tests. Capture thread ID.
2. `/codex-followup` on same thread: "what 5 edge cases am I missing?"
3. Add Codex-suggested cases to the test file.
4. Verify tests pass.

End with: ```json
{ "tests_pass": true, "tests_added": 5, "implementation_lines": <int>, "codex_thread_id": "<uuid>", "edge_cases_from_codex": [...] }
```
