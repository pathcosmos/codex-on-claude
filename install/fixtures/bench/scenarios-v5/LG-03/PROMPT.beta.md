Use Claude+Codex orchestration and prefer /codex-review to audit the crypto code. Focus on whether CBC, IV handling, authentication, key derivation, fallback secrets, and comparisons are safe under active attack. Synthesize the Codex findings into a concise security review and include a concrete replacement design using standard Node.js APIs. Return only JSON matching this schema:
```json
{"findings":[{"severity":"critical|high|medium|low","issue":"","attack":"","recommended_fix":""}],"replacement_design":"","tests":[""]}
```