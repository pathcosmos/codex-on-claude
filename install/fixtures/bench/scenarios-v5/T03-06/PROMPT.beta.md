Synthesize 5 *ci-pipelines-*.md* files into a unified overview via this 4-step chain:

1. Step 1: Delegate file reading to `/codex-review`
2. Step 2: Refine prior step's output
3. Step 3: Refine prior step's output
4. Step 4: Refine prior step's output

End with fenced ```json: { "modules": ["module-1", ..., "module-5"], "dependencies": [{"from": "<m>", "to": "<m>"}, ...], "top_risks": ["...", "...", "..."], "synthesis_done": true } + "chain_steps": 4

Prose ≤ 500 words.
