There are 10 JS modules in the current directory totaling ~20KB. Delegate the audit to the `codex-reviewer` subagent (or invoke `mcp__codex__codex` with `sandbox=read-only` and ask Codex to read all files itself).

**Do NOT use your own Read tool to ingest the files into your main context.** Your job: (a) delegate, (b) receive a summarized audit, (c) reformat into the schema.

End with a fenced ```json block:

```json
{ "issues_found": [{"file": "<name>", "category": "security"|"reliability"|"performance"|"other", "summary": "<≤25 words>"}, ...], "files_audited": <int>, "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 350 words.
