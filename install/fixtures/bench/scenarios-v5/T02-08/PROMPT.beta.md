Adversarial review of `src/code.go`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for jitter_seeded_deterministic-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "jitter_seeded_deterministic" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
