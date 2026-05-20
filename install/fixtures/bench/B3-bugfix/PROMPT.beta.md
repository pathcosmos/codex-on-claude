In the current directory there is `buggy.py` and `test_buggy.py`. The tests fail because of one bug in `buggy.py`.

Use `/codex-fix` with file allowlist scoped to `buggy.py` to apply the minimal fix. Do NOT modify `test_buggy.py`. Keep the patch minimal (≤10 LOC delta).

When done, reply with the single line `DONE` and stop.
