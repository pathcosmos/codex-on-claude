There are 8 JS files (~35KB total). Use `/codex-review` or `codex-reviewer` subagent to analyze the require/import graph. Do NOT read all 8 files into your main context yourself.

End with a fenced ```json block:

```json
{ "dependency_graph": [{"from": "<file>", "to": "<file>"}, ...], "circular_dependencies": [["<a>", "<b>"], ...], "missing_files": ["<name>", ...], "files_analyzed": <int>, "delegated_to": "codex-reviewer" | "mcp__codex__codex" }
```

Prose ≤ 350 words.
