# Orders Service

## Purpose
Order lifecycle: create, fulfill, ship, cancel, refund.

## Endpoints
- POST /orders — create
- GET /orders/:id — fetch
- POST /orders/:id/fulfill — mark fulfilled (idempotent)
- POST /orders/:id/cancel — soft-cancel
- POST /orders/:id/refund — issue refund

## Storage
- PostgreSQL: orders, order_items, fulfillments
- Event log: Kafka topic `order-events`

## Dependencies
- inventory-service (stock check on create)
- payments-service (charge on create, refund on cancel)
- shipping-service (label gen on fulfill)
- auth-service (req validation)

## SLOs
- p99 latency: 400ms
- Order create success rate: 99.9%

## Known issues
- inventory race condition under burst (mitigation: optimistic lock)
- Payment idempotency keys collision if client retries within 1s
