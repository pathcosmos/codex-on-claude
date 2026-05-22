# D3 — token efficiency via subagent delegation rubric

## What's tested

`access.log` is ~360KB (~90K tokens). α reads it directly — its `tool_result` size pushes into the main context, inflating cache_creation_tokens. β delegates to the `codex-reviewer` subagent (or Codex MCP directly), so the main context only sees a 2-3KB summary.

## Mechanical criteria

| Criterion | Pass | Notes |
|---|---|---|
| Top 3 endpoints in JSON | mechanical | Both arms must answer correctly. |
| Top error users non-empty | mechanical | Substance check. |
| time_range present | mechanical | Both timestamps. |
| Mentions `/api/v1/` | mechanical | Actual analysis happened. |
| α: tool_result p95 ≤ 1MB | sanity gate | Just ensures α didn't crash. |
| β: tool_result p95 ≤ 10KB | **key differential** | Confirms delegation worked — main context stayed lean. |
| β: `delegated_to` field set | mechanical | Confirms the subagent path. |

## Expected outcome

β-strict-win on token efficiency: β's `claude_in` + `cache_creation` total should be 5-20× lower than α's. Quality (top endpoints, top error users) should be equivalent. The verdict will likely be β-win because β cost drops despite an extra Codex call — the saved Claude tokens outweigh the Codex spend.
