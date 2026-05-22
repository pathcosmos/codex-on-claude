Use Claude+Codex orchestration and prefer /codex-review for a security pass over both files. The final answer should prioritize exploitable risks and include container hardening changes. Keep the recommendations realistic for a production Node image. Return only JSON matching this schema:
```json
{"findings":[{"severity":"critical|high|medium|low","file":"","problem":"","exploit":"","fix":""}],"highest_risk":"critical|high|medium|low","hardening_steps":[""]}
```