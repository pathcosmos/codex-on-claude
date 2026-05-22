Adversarial review of `src/code.go`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for lost_update-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "lost_update" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
