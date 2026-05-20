Read `SPEC.md` in the current directory. Use `/codex-review` (read-only) to cross-check that you have captured every endpoint, then return them as one structured list.

End with a fenced ```json block:

```json
{
  "endpoints": [
    {"method": "GET" | "POST" | ..., "path": "/...", "auth": "none" | "bearer" | "bearer admin"}
  ]
}
```

No prose besides the JSON block. Do not skip any endpoint.
