Read the file `access.log` directly (use the Read tool — do NOT delegate to a subagent). Then analyze it and produce a report covering:

1. Top 3 endpoints by request count.
2. Top 3 user IDs by error rate (status ≥ 400).
3. The single slowest endpoint by p95 latency.
4. Any IP addresses that appear in unusually many 401/403 responses (potential credential stuffing).
5. The earliest and latest timestamps in the log.

End with a fenced ```json block:

```json
{ "top_endpoints": ["...", "...", "..."], "top_error_users": ["...", "...", "..."], "slowest_endpoint_p95_ms": <int>, "suspicious_ips": ["..."], "time_range": ["<earliest>", "<latest>"] }
```

Prose ≤ 350 words.
