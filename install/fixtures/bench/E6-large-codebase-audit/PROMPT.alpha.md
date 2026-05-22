There are 10 JS modules in the current directory. Read all of them directly. Each has at least one planted security or reliability issue. Identify the issues across the whole codebase.

End with a fenced ```json block:

```json
{ "issues_found": [{"file": "<name>", "category": "security"|"reliability"|"performance"|"other", "summary": "<≤25 words>"}, ...], "files_audited": <int> }
```

Prose ≤ 350 words.
