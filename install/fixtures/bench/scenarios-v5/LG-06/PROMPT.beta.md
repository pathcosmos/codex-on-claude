Use Claude+Codex orchestration to analyze the SQL. Prefer /codex-review for a second pass over query semantics and likely PostgreSQL plan issues. Your final answer should include a concrete rewrite and index recommendations, while calling out any change that could alter results. Return only JSON matching this schema:
```json
{"problems":[{"type":"performance|correctness","detail":"","fix":""}],"rewritten_query":"","indexes":[""]}
```