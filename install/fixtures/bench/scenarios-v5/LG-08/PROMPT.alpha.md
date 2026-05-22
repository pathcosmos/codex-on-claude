Compare the OpenAPI contract and TypeScript client for mismatches that could break production clients or generated SDKs. Identify contract-level bugs and client assumptions, then propose minimal changes. Focus on path parameters, enums, required fields, date formats, and error handling. Return only JSON matching this schema:
```json
{"mismatches":[{"file":"","field_or_operation":"","problem":"","fix":""}],"compatibility_risk":"low|medium|high","tests":[""]}
```