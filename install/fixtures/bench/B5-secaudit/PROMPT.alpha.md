Perform a security audit of `server.js` in the current directory. There are exactly 4 security issues planted. Identify them by category.

End with a fenced ```json block:

```json
{
  "findings": [
    {"category": "sqli" | "xss" | "weak_crypto" | "hardcoded_secret" | "other",
     "line_hint": <int>, "summary": "<≤30 words>"}
  ]
}
```

Prose ≤ 250 words.
