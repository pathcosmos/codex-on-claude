Use Claude+Codex orchestration to compare both files, preferably via /codex-review. Ask Codex to catch subtle contract/client inconsistencies and then synthesize the actionable mismatches. Keep the final result concise but specific enough to update the OpenAPI spec and client safely. Return only JSON matching this schema:
```json
{"mismatches":[{"file":"","field_or_operation":"","problem":"","fix":""}],"compatibility_risk":"low|medium|high","tests":[""]}
```