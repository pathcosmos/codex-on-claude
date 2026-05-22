Perform a focused security audit of this containerized Node service. Identify exploitable issues in the Dockerfile and route handler, including command execution, dependency/install practices, secret handling, runtime user, and error disclosure. Provide concrete remediations, not just labels. Return only JSON matching this schema:
```json
{"findings":[{"severity":"critical|high|medium|low","file":"","problem":"","exploit":"","fix":""}],"highest_risk":"critical|high|medium|low","hardening_steps":[""]}
```