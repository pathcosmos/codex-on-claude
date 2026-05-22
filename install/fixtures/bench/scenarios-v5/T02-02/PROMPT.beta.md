Adversarial review of `src/code.py`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for float_precision-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "float_precision" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
