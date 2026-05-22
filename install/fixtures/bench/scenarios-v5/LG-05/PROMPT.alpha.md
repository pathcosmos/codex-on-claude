Review this queue consumer for distributed-systems correctness. Assume the queue provides at-least-once delivery and messages can be redelivered after crashes or ack failures. Identify failure modes that can create duplicate charges, lost idempotency records, or bad retry behavior. Propose a robust design using transactional or idempotent patterns. Return only JSON matching this schema:
```json
{"failure_modes":[{"scenario":"","impact":"","fix":""}],"required_invariants":[""],"recommended_design":""}
```