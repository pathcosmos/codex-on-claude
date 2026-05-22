# D4 — analyze → improve loop rubric

## What's tested

Two seed logs are pre-crafted to trigger 2 analyzer rules:
- `ruleRepeatedPrompts` — 9 identical (skill, promptChars/100, sandbox) tuples in `repeated-prompts.jsonl`.
- `ruleLargeResponsesNotAgent` — 5 entries with `responseChars≥5000` and `viaAgent=false` in `large-direct-responses.jsonl`.

α has to read the JSONL files and infer the anti-pattern manually. β uses the analyzer (either CLI or Codex-as-analyzer) which fires the rule deterministically.

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| `candidate_id` present | mechanical | Must commit to a specific candidate. |
| `category` in allowed set | mechanical | Forces a real categorization. |
| Mentions "repeat" | mechanical | Should call out the repeated-prompts pattern. |
| Mentions "response" | mechanical | Should call out response-size or token issue. |
| β: `analyzer_invoked: true` field | mechanical | Confirms the loop branch was taken. |

## Expected outcome

β should land its analyzer hit faster and more confidently. α may produce a vague "fewer prompts" recommendation without the specific rule name. β-win expected if α misses one of the two patterns.
