Use Claude+Codex orchestration and prefer /codex-review to reason through crash windows and at-least-once delivery semantics in this worker. The final answer should name the precise ordering bugs and propose an implementation approach that prevents duplicate billing even under retry, crash, and ack failure. Return only JSON matching this schema:
```json
{"failure_modes":[{"scenario":"","impact":"","fix":""}],"required_invariants":[""],"recommended_design":""}
```