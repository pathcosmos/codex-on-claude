Delegate the analysis of `access.log` to the `codex-reviewer` subagent (or, if unavailable, invoke `mcp__codex__codex` with `sandbox=read-only` and ask Codex to read+analyze the file). Do NOT use the Read tool yourself to ingest the whole file into your main context — your job is to (a) issue the delegation, (b) receive a summarized result, (c) re-format it into the schema below.

The delegated analysis must cover:

1. Top 3 endpoints by request count.
2. Top 3 user IDs by error rate (status ≥ 400).
3. The single slowest endpoint by p95 latency.
4. IP addresses with unusually many 401/403 responses (potential credential stuffing).
5. Earliest and latest timestamps in the log.

End with a fenced ```json block:

```json
{ "top_endpoints": ["...", "...", "..."], "top_error_users": ["...", "...", "..."], "slowest_endpoint_p95_ms": <int>, "suspicious_ips": ["..."], "time_range": ["<earliest>", "<latest>"], "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 350 words.
