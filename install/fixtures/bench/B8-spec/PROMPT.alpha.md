Read `SPEC.md` in the current directory. Extract every endpoint as a structured object.

End with a fenced ```json block:

```json
{
  "endpoints": [
    {"method": "GET" | "POST" | ..., "path": "/...", "auth": "none" | "bearer" | "bearer admin"}
  ]
}
```

No prose besides the JSON block. Do not skip any endpoint.
