Audit `vulnerable.js` for security issues, then directly edit the file to fix them. There are exactly 3 planted issues.

End with a fenced ```json block:

```json
{ "findings": [{"category": "sqli"|"xss"|"timing"|"other", "summary": "<≤25 words>"}, ...], "fixes_applied": <int>, "remaining_issues": <int> }
```

Prose ≤ 250 words.
