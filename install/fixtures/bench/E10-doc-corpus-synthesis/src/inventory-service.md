# Inventory Service

## Purpose
Real-time stock + reservation system.

## Endpoints
- GET /inventory/:sku — current available
- POST /inventory/:sku/reserve — soft reservation (5 min)
- POST /inventory/:sku/commit — convert reservation to deduction
- POST /inventory/:sku/release — release reservation

## Storage
- PostgreSQL: inventory_levels, reservations
- Redis: hot SKU cache, write-through

## Dependencies
- warehouse-service (real-time stock from physical inventory)
- orders-service (downstream consumer)

## SLOs
- p99 latency: 100ms
- Inventory consistency: eventual, within 30s

## Known issues
- Reservation timeout = 5 min, but no compensating event if order takes >5min
- Cache stampede on hot SKU during flash sales
