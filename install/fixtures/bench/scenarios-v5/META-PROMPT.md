You are designing benchmark test scenarios for a paired comparison between Claude (alpha-arm) vs Claude+Codex orchestration (beta-arm). Each scenario tests a specific software engineering task.

Generate **EXACTLY 13 scenarios** as a single JSON array. Vary the categories to maximize diversity.

## Required schema (per scenario)

```json
{
  "id": "L{ARM}-{NN}",   // L=LLM-gen, ARM=A/B/G, NN=01-13
  "category": "<one of: Code review | Bug fix | Documentation | Synthesis | Security audit | Performance | Hard reasoning | Architecture | i18n | K8s manifest | Regex/ReDoS | Concurrency | SQL optimization | Parser | Cryptography | Type inference | API contract | GDPR | Distributed | Mock generation | Memory leak | ML interface>",
  "hypothesis_target": "<one of: P1_self_review | P2_adversarial | P3_reasoning_high | P4_tdd_followup | P5_catastrophe | P6_ceiling | P7_subagent_risk | NEW>",
  "src_files": [
    { "name": "code.js", "content": "<source code or fixture, 200-1500 chars>" }
  ],
  "prompt_alpha": "<task instruction for Claude-only (no Codex), 50-200 words, end with fenced ```json block schema>",
  "prompt_beta": "<task instruction for Claude+Codex (encourage /codex-review or /codex-fix), 50-200 words, end with fenced ```json block schema>",
  "oracle_criteria": [
    { "name": "<short>", "type": "<final_json_field | final_json_array_min | contains_text | not_contains_text | tool_call_count_min | word_count_max>", "args": { ... } }
  ]
}
```

## Rules

1. **Discriminative**: scenarios should not be trivial (α gets 100%) or impossible (both fail). Target medium difficulty where β might or might not lift.
2. **Realistic**: src content must look like real production code/config/docs.
3. **Vary**: at least 6 different categories across the 13 scenarios.
4. **Vary hypothesis_target**: include at least 4 different target patterns.
5. **No empty src_files**: each scenario must have at least one file with substantive content.
6. **ORACLE quality**: each scenario needs 4-7 criteria. At least 1 should be β-specific (using `tool_call_count_min` with `mcp__codex__codex`).

Output the JSON array directly, no prose. Start with `[` and end with `]`.
