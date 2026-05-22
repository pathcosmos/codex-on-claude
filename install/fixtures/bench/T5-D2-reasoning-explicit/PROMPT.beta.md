Solve the constraint puzzle in `problem.md`. Invoke `mcp__codex__codex` with these EXPLICIT parameters: `sandbox=read-only`, `approval-policy=never`, **`reasoning=high`** (or the highest reasoning level your subscription tier allows). Ask Codex to enumerate constraints step-by-step before placing queens, and to mentally verify each constraint after placement.

Use Codex's answer and your own verification to emit the final placement as a fenced ```json block matching:

```json
{ "queens": [[r1, c1], [r2, c2], ..., [r6, c6]], "verifications": {"non_attacking": true, "no_forbidden": true, "parity_ok": true, "color_count": <int>}, "codex_consulted": true, "reasoning_level": "high" }
```

Prose ≤ 400 words.
