Adversarial review of `src/code.ts`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for scheme_confusion-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "scheme_confusion" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
