# bench/ — Claude-vs-Codex paired benchmark harness

This directory holds the **paired α (Claude-only) / β (Claude + codex-on-claude)** benchmark suite
described in [`docs/test-claude-vs-codex-bench.md`](../../../docs/test-claude-vs-codex-bench.md).

## Layout

```
install/fixtures/bench/
├── README.md                 # this file
├── run.sh                    # single-arm runner: ./run.sh <scenario> <alpha|beta>
├── runall.sh                 # full N=1 + N=3-on-core matrix
├── score.mjs                 # ORACLE.json + stream.jsonl → result.json
├── report.mjs                # _runs tree → final markdown table
├── B1-large-diff/            # 12 paired scenarios
│   ├── PROMPT.alpha.md       # plain-Claude prompt
│   ├── PROMPT.beta.md        # Skill-invoking prompt
│   ├── ORACLE.json           # machine-checkable expectations
│   ├── RUBRIC.md             # 1-minute human-checkable criteria
│   └── src/ | diff.patch | ...  # actual fixture content
├── ...
├── B12-trap/
└── _runs/                    # gitignored runtime output
    └── <RUN_ID>/<scenario>/<alpha|beta>/
        ├── stream.jsonl      # raw stream-json from claude -p
        ├── stdout.txt
        ├── stderr.txt
        ├── timing.json       # {"wall_ms":N}
        ├── cost.json         # Claude-side summed message.usage
        ├── cost.codex.json   # Codex-side tokens (exact if usage field present, else estimated)
        ├── tool_calls.jsonl  # one tool_use event per line (for B11 restraint check)
        ├── workspace/        # scratch copy of fixture src/ — Claude works here
        ├── changed.files.txt # `git diff --stat` after the run
        ├── changed.diff      # full diff
        ├── tests.txt         # stdout of fixture run_tests.sh, if present
        ├── tests.exit        # exit code of run_tests.sh
        └── result.json       # rubric scores written by score.mjs
```

## Prerequisites (one-time host setup)

1. `codex-on-claude doctor` reports all 6 checks ok.
2. `claude mcp get codex` shows the MCP server connected.
3. Install β arm components on the host:

   ```sh
   codex-on-claude --patterns=review,followup,fix \
     --context-policy=direct \
     --improvement-loop=off \
     --threads=basic \
     --yes
   ```

   `improvement-loop=off` is required — PostToolUse auto-log hooks would skew the token measurements.

## Usage

### Single arm of one scenario
```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
TS="$TS/run1" ./run.sh B3-bugfix alpha
TS="$TS/run1" ./run.sh B3-bugfix beta
```

### Full matrix (N=1 for all + N=3 for B1/B5/B6)
```sh
./runall.sh
node report.mjs "$(ls -t _runs | head -1)" > "_runs/$(ls -t _runs | head -1)/report.md"
```

### Per-run timeout (`RUN_TIMEOUT`)
`run.sh` wraps each `claude -p` in a watchdog so a hung Codex call in a chain scenario (e.g. the
E-series) can't stall the whole suite. Default **480s**; a timed-out run is killed (whole process
tree) and scored as a failure, with a `TIMEOUT-KILL` marker in its `stderr.txt` and `timed_out:1`
in `timing.json`. Override per invocation:
```sh
RUN_TIMEOUT=120 TS="$TS/run1" ./run.sh E2-security-harden-loop beta
```

## Caveats

See the `## 측정하지 않는 것` section in `docs/test-claude-vs-codex-bench.md`. The harness is intentionally
honest about model variance, Codex-side token estimation, and stream-json schema dependence.
