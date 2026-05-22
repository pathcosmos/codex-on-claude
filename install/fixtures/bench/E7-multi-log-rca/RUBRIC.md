# E7 — multi-log-rca rubric

## Scenario

3 layers of a cascading failure:
- DB pool exhausted at t=80-130 (wait_ms 5K-15K) → timeout
- Cache misses with DB backend latency at t=130-200 → thundering herd at 200-250
- API 5xx/timeout at t=200-280 → 429 rate-limit at 280-320

Root cause: DB pool exhaustion. Cascade: DB → cache → API.

β should delegate to subagent and receive summary, keeping main context lean.
