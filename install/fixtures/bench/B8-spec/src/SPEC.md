# Mini-SPEC — 40 endpoints

This fixture is a placeholder. To be functional, expand to 40 endpoint stanzas in the form:

```
### GET /users/{id}        — auth: bearer
Returns user by id.

### POST /users            — auth: bearer
Create a user.

### DELETE /users/{id}     — auth: bearer admin
Hard-delete a user.

### GET /health            — auth: none
Liveness probe.
```

For the v1 stub, only 6 endpoints are listed below; expand to 40 before running B8 for real.

### GET /users/{id}        — auth: bearer
Return user.

### POST /users            — auth: bearer
Create user.

### DELETE /users/{id}     — auth: bearer admin
Hard delete.

### GET /health            — auth: none
Liveness.

### POST /orders           — auth: bearer
Create order.

### GET /orders/{id}       — auth: bearer
Get order.
