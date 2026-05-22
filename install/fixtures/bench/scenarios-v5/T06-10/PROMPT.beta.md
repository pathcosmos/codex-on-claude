Analyze 4 files (~20KB total) in src/. Delegate the analysis to the `codex-reviewer` subagent (or invoke `mcp__codex__codex` with sandbox=read-only). Do NOT read all files into your main context yourself.

Receive summary + reformat into:

```json
{ "issues": [{"file": "<name>", "category": "<type>", "summary": "<≤25 words>"}, ...], "files_analyzed": 4, "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 350 words.
