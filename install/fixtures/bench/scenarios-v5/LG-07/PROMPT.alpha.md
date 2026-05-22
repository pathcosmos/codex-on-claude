Find and fix the concurrency and cache correctness issues in this token cache. You may describe a patch rather than returning full files, but be precise enough for implementation. Include a small test plan that would catch the race or redundant refresh behavior. Consider expiration, double-checked locking, and thread-safe invalidation. Return only JSON matching this schema:
```json
{"bugs":[{"issue":"","race_or_failure":"","fix":""}],"patch_summary":"","tests":[""]}
```