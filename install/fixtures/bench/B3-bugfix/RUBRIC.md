# B3 — single-file bugfix rubric

| Criterion | Pass | Notes |
|---|---|---|
| `python3 test_buggy.py` exits 0 after the run | `tests.exit == 0` | Detects whether the fix is functionally correct. |
| Only `buggy.py` modified | `changed.files.txt` ⊆ {`buggy.py`} | No collateral test or other edits. |
| Patch is minimal (≤ 10 LOC delta) | Inspect `changed.diff` | Counter to "rewrite the whole file" tendency. |
| β actually invoked Codex MCP at least once | `tool_calls.jsonl` has ≥1 `mcp__codex__codex` entry | Confirms `/codex-fix` was used on the β arm. |

For the LOC-delta check, the harness does not block fail-large at the moment — inspect `changed.diff` manually if a run scores 4/4 but the diff is suspiciously big.
