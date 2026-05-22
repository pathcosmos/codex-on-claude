# E6 — large-codebase-audit rubric

## Codebase

10 modules, ~21KB total. Each has 1+ planted issues. Categories include: MD5, SQL injection, path traversal, ReDoS, open redirect, missing timeout, unbounded cache, PII in logs, no backoff, high-cardinality metrics.

## Differential

α reads all 10 files → main context grows ~21KB.
β delegates to `codex-reviewer` subagent → main context stays <15KB (just summary).

Key: β's `tr_p95` (tool_result p95) should be much lower than α's.
