Adversarial review of `src/code.js`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for off_by_one_at_boundary-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "off_by_one_at_boundary" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
