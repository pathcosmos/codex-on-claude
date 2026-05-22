Adversarial review of `src/code.ts`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for default_returned_on_error-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "default_returned_on_error" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
