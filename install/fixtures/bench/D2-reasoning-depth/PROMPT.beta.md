Solve the constraint puzzle in `problem.md`. Invoke `mcp__codex__codex` once with `sandbox=read-only`, `approval-policy=never`, and ask Codex to reason about the problem at high reasoning depth (model permits `reasoning=high`). Use Codex's answer plus your own verification to emit the final placement as a fenced ```json block matching:

```json
{ "queens": [[r1, c1], [r2, c2], ..., [r6, c6]], "verifications": {"non_attacking": true, "no_forbidden": true, "parity_ok": true, "color_count": <int>}, "codex_consulted": true }
```

Prose ≤ 400 words.
