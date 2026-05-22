Adversarial review of `src/code.js`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for timing_attack-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "timing_attack" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
