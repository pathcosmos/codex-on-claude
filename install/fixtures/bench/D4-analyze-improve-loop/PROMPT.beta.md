The directory `logs/` contains two JSONL files of Codex usage records.

Step 1: Run the codex-on-claude analyzer against these logs. You can either invoke `mcp__codex__codex` and ask Codex to apply the same analyzer logic, OR run `codex-on-claude analyze --logs-dir=./logs --days=30` via Bash if available, OR if neither path works, simulate by reading the files and applying the documented rules (ruleRepeatedPrompts: same skill|promptChars/100|sandbox ≥8 times; ruleLargeResponsesNotAgent: ≥3 entries with responseChars ≥5000 and viaAgent=false).

Step 2: From the candidates surfaced, pick the highest-impact one and propose a concrete improvement (e.g., raise threshold, route via subagent, batch prompts).

Step 3: Output the chosen candidate.

End with a fenced ```json block:

```json
{ "candidate_id": "<short kebab-case id>", "category": "token-efficiency" | "reliability" | "cost" | "redundancy" | "other", "applied": false, "reason": "<≤30 words>", "analyzer_invoked": true }
```

Prose ≤ 200 words.
