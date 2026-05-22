Use Claude+Codex orchestration and prefer /codex-fix or /codex-review to inspect the cache under concurrent calls. The desired output is a precise fix strategy plus tests, not generic locking advice. Look for redundant token fetches, stale returns, and clear() interactions with get(). Return only JSON matching this schema:
```json
{"bugs":[{"issue":"","race_or_failure":"","fix":""}],"patch_summary":"","tests":[""]}
```