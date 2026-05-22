There's a failing test in `buggy.test.js` for the function in `buggy.js`. Diagnose the bug, fix `buggy.js`, then run `node buggy.test.js` to verify all 4 assertions pass.

After verification, end with a fenced ```json block:

```json
{ "bug_summary": "<≤20 words>", "files_changed": ["buggy.js"], "tests_pass": true }
```

Prose ≤ 200 words.
