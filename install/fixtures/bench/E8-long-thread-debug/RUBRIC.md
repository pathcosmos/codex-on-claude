# E8 — long-thread-debug rubric

## What's tested

α: 10-turn debug as a single Claude pass (no thread persistence).
β: 1 `mcp__codex__codex` (turn 1) + ≥3 `mcp__codex__codex-reply` (turns 2-10) on the same thread.

Expected: root cause = CDN cache-control (`s-maxage`, `must-revalidate`) issues. β's sticky thread should maintain coherence across turns.

Lowered β bar to ≥3 codex-reply calls (instead of 9) since the LLM may decide to batch related sub-questions in single replies. Whether β actually executes 10 distinct turns is qualitatively verified post-run.
