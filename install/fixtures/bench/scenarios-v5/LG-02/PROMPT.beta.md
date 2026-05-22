Use Claude+Codex orchestration to inspect the JavaScript with a security lens. Prefer /codex-review or /codex-fix to reason through regex engine behavior and propose safe replacements. The answer should distinguish true ReDoS risks from merely imperfect validation, and it should include attack strings or boundary tests that would expose the problem. Return only JSON matching this schema:
```json
{"vulnerabilities":[{"function":"","regex":"","why_vulnerable":"","safe_pattern":"","test_inputs":[""]}],"overall_risk":"low|medium|high","notes":""}
```