# E10 — doc-corpus-synthesis rubric

## Corpus

6 microservice docs (auth, orders, inventory, payments, shipping, audit) — purposes, endpoints, storage, dependencies, SLOs, known issues.

## Expected dependencies

- orders → inventory, payments, shipping, auth
- payments → auth, audit
- shipping → orders, audit
- inventory → orders (downstream consumer only — but data flow)
- All services → audit (for compliance trail)

## Top expected risks

1. Cross-service idempotency (payment-refund race during cancel)
2. Cache stampede on inventory hot SKU under burst
3. No cross-region failover on audit-service
