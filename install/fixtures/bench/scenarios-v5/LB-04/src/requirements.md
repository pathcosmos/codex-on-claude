# Rate Limiter Requirements

1. Token bucket algorithm: 100 tokens, refill at 10 tokens/sec
2. Per-user limits: track by userId from request context
3. HTTP 429 when exceeded, include Retry-After header
4. Tokens consumed: 1 for read, 5 for write
5. Redis backing for distributed instances
6. Expiring keys to clean up stale users
7. Return remaining tokens in response headers
8. Allow burst: max 150 tokens
9. Configuration via environment variables
