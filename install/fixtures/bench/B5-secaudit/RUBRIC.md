# B5 — security audit rubric

Planted issues (in `server.js`):
1. **Hard-coded secret**: `DB_PASSWORD = "hunter2-prod"` (line ~7).
2. **SQL injection**: `"SELECT ... WHERE id = " + req.query.id` (line ~12).
3. **Reflected XSS**: user input echoed unescaped into HTML (line ~14).
4. **Weak crypto**: MD5 for hashing in `/hash` (line ~20).

| Criterion | Pass | Notes |
|---|---|---|
| `findings.length ≥ 4` | mechanical | Catches under-reporting. |
| `findings.length ≤ 5` | mechanical | Discourages over-reporting / pad. |
| Text mentions "sql" | mechanical | SQLi catch heuristic. |
| Text mentions "xss" | mechanical | XSS catch heuristic. |
| Text mentions "md5" | mechanical | Weak-crypto catch heuristic. |
| Text mentions "secret" | mechanical | Hard-coded secret catch heuristic. |

Expected: β may help find all 4 reliably while α catches 2–3 (especially on Haiku).
