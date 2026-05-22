# Payments Service

## Purpose
Stripe/PSP integration for charges, refunds, payouts.

## Endpoints
- POST /payments/charge — create charge (idempotent via key)
- POST /payments/refund/:charge_id — full or partial
- GET /payments/:id — status
- POST /payments/webhook — Stripe callback

## Storage
- PostgreSQL: payments, refunds, payment_methods
- Vault: tokenized PANs (PCI scope)

## Dependencies
- auth-service (for user-scoped operations)
- audit-service (PCI-required audit trail)
- orders-service (status-changes notify orders)

## SLOs
- p99 latency: 1500ms (PSP-bound)
- Charge success rate: 99.7%

## Known issues
- Webhook signature verification has a 0.01% false-reject rate
- Refund-on-cancellation race if cancel arrives before charge confirms
