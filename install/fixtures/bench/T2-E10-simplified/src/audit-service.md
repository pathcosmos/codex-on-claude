# Audit Service

## Purpose
Tamper-evident audit log for security/compliance.

## Endpoints
- POST /audit/event — emit audit entry
- GET /audit/query — search by user/time/action (admin only)
- GET /audit/verify/:checkpoint — Merkle proof

## Storage
- PostgreSQL: audit_events (append-only)
- BigQuery: long-term archive (>90 days)
- IPFS: Merkle tree checkpoints (daily)

## Dependencies
- auth-service (for admin queries)

## SLOs
- p99 latency: 50ms (write); 2000ms (search)
- Durability: 11 9s

## Known issues
- BigQuery archival lag: up to 6 hours
- No cross-region replication; single region failure = read-only
