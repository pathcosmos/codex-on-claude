# Current Monolith Architecture

## Problem
- Single Node.js app handles auth, orders, payments, notifications
- Database: PostgreSQL 500GB, single instance
- Cache: Redis for sessions
- Message queue: RabbitMQ for async jobs

## Constraints
- 10K concurrent users (peak)
- 99.99% availability SLA
- Payment processing latency < 2sec
- Notification delivery < 5min
- Team: 12 engineers

## Question
Should we split into microservices? If yes, what's the safe boundary?
