Adversarial review of `src/code.java`. Call `/codex-review` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for heap_invariant_broken_on_remove-class problems specifically."

End with: ```json
{ "critical_issue": "<≤30 words>", "category": "heap_invariant_broken_on_remove" | "other", "line_hint": <int>, "codex_consulted": true }
```

Prose ≤ 250 words.
