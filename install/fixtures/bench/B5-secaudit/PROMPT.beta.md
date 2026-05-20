Perform a security audit of `server.js` using `/codex-review`. There are exactly 4 security issues planted.

End with a fenced ```json block matching the α schema:

```json
{
  "findings": [
    {"category": "sqli" | "xss" | "weak_crypto" | "hardcoded_secret" | "other",
     "line_hint": <int>, "summary": "<≤30 words>"}
  ]
}
```

Prose ≤ 250 words.
