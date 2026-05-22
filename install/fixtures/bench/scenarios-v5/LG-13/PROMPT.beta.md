Use Claude+Codex orchestration and prefer /codex-fix or /codex-review to inspect the event helper. The final answer should catch the leak, mutation semantics during publish, duplicate subscriptions, and cleanup of empty topics if relevant. Include tests that would fail on the current code. Return only JSON matching this schema:
```json
{"bugs":[{"issue":"","impact":"","fix":""}],"patch_summary":"","tests":[""]}
```