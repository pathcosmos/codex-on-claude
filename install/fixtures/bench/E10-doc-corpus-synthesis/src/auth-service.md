# Auth Service

## Purpose
Handles OAuth2 + JWT token issuance for the platform.

## Endpoints
- POST /auth/login — exchange credentials for refresh token
- POST /auth/refresh — exchange refresh for access token (5 min TTL)
- POST /auth/logout — revoke refresh
- GET /auth/jwks — public key set

## Storage
- PostgreSQL: users table (id, email, password_hash, mfa_secret, created_at)
- Redis: refresh-token cache, 7-day TTL

## Dependencies
- emails-service (for password reset)
- audit-service (for login event)

## SLOs
- p99 latency: 200ms
- Availability: 99.95%

## Known issues
- No rate limiting on /auth/login (mitigation in PR #432)
- Refresh-token rotation broken if Redis fails open
