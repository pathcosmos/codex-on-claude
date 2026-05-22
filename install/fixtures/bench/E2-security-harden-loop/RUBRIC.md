# E2 — security-harden-loop rubric

## Planted issues

1. SQL injection (`buildUserQuery`): `db.query("... WHERE id = " + userId)` — should parameterize.
2. XSS (`renderProfile`): `<div>Welcome, ${name}!</div>` — unescaped interpolation.
3. Timing attack (`checkAdmin`): `token === ADMIN_TOKEN` — should use `crypto.timingSafeEqual`.

## Differential

α single-pass audit + fix. β loop: review → fix → review (with `tool_call_count_min=2` on β).

Expected: β should be more reliable at hitting all 3, and the second round catches partial fixes.
