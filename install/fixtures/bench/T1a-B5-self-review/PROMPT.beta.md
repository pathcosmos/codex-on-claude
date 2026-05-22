Perform a security audit of `server.js` via TWO-ROUND review:

1. Round 1 — call `/codex-review` (or `mcp__codex__codex` read-only) on server.js to find issues. Capture the thread ID.
2. Reflect on Round 1 findings briefly.
3. Round 2 — call `/codex-followup` on the same thread asking "any subtle issues you missed in Round 1?" or `/codex-review` again.
4. Consolidate findings.

There are exactly 4 issues planted.

End with a fenced ```json block matching the α schema:

```json
{
  "findings": [
    {"category": "sqli" | "xss" | "weak_crypto" | "hardcoded_secret" | "other",
     "line_hint": <int>, "summary": "<≤30 words>"}
  ]
}
```

Prose ≤ 300 words.
