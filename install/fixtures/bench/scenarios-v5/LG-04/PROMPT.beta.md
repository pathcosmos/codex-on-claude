Use Claude+Codex orchestration to review this privacy export endpoint. Prefer /codex-review so the code is checked for authorization bypasses, accidental disclosure, retention, logging, and data minimization concerns. Then provide a compact GDPR-focused engineering review with concrete fixes a team could implement. Return only JSON matching this schema:
```json
{"issues":[{"severity":"critical|high|medium|low","requirement":"","problem":"","fix":""}],"needs_policy_review":true,"summary":""}
```