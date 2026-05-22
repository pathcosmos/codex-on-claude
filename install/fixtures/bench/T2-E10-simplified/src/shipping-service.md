# Shipping Service

## Purpose
Carrier integration: FedEx, UPS, USPS.

## Endpoints
- POST /shipping/quote — get rates from all carriers
- POST /shipping/label — generate shipping label
- GET /shipping/track/:tracking — real-time tracking
- POST /shipping/webhook — carrier event callback

## Storage
- PostgreSQL: shipments, labels, tracking_events
- S3: PDF labels

## Dependencies
- orders-service (label gen tied to fulfillment)
- warehouse-service (pickup scheduling)
- audit-service (for label issuance)

## SLOs
- p99 latency: 3000ms (carrier APIs slow)
- Label gen success: 99.5%

## Known issues
- FedEx API rate limit: 100 req/min/account, no backoff
- USPS sandbox returns wrong tracking format
