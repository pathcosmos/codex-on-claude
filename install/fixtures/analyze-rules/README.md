# analyze-rules fixtures

Deterministic seed data for the analyzer rule engine (`install/analyze.mjs`).
Each fixture is a minimal dataset that triggers exactly one rule, so the test
scenarios in `docs/test-scenarios-codex-calls.md` (group G7-5) can verify
candidate generation without depending on real-world usage.

## How to use

```sh
# Pick a rule directory + copy into the live log path (filename uses TODAY's date).
TARGET=~/.claude/codex-on-claude/logs
mkdir -p "$TARGET"
cp install/fixtures/analyze-rules/logs/large-direct-responses.jsonl \
   "$TARGET/usage-$(date +%Y-%m-%d).jsonl"

# Or for thread-based rules, copy the JSON files into the threads catalog:
THREADS=~/.claude/codex-on-claude/threads
mkdir -p "$THREADS"
cp install/fixtures/analyze-rules/threads/incidents-cluster/*.json "$THREADS/"

codex-on-claude analyze --days=30
```

The analyzer filters log files by **filename date**, not entry timestamp, so
fixtures keep fixed `ts` fields and you control freshness via the destination
filename. For thread-based rules (`stale-active-threads`), the analyzer reads
`lastUsedAt` from the JSON body — these fixtures use real April 2026 dates so
the "14+ days inactive" condition stays true relative to any date past
2026-05-04.

## What each fixture triggers

| Fixture path | Rule fired | Threshold |
|---|---|---|
| `logs/empty.jsonl` | `ruleNoLogs` | 0 entries |
| `logs/large-direct-responses.jsonl` | `ruleLargeResponsesNotAgent` | ≥3 entries with `responseChars ≥ 5000` and `viaAgent=false` |
| `logs/repeated-prompts.jsonl` | `ruleRepeatedPrompts` | same `skill|promptChars/100|sandbox` shape ≥ 8 times |
| `logs/sandbox-mismatch.jsonl` | `ruleSandboxMismatch` | ≥3 entries with `sandbox=workspace-write` AND `responseChars < 500` |
| `logs/session-not-found.jsonl` | `ruleSessionNotFound` | ≥2 entries with `outcome` / `errorKind = session-not-found` |
| `logs/timeouts.jsonl` | `ruleTimeouts` | ≥2 entries with `outcome=timeout` |
| `logs/fallback-flurry.jsonl` | `ruleFrequentFallback` | ≥5 entries with `outcome=fallback` (any `errorKind`) in the window |
| `threads/stale-active/*.json` | `ruleStaleActiveThreads` | ≥3 threads with `status=active` AND `lastUsedAt` older than 14 days |
| `threads/incidents-cluster/*.json` | `ruleIncidentRepeat` | ANY single thread with `incidents.length ≥ 3` |
| `threads/tag-cluster/*.json` | `ruleSimilarTagCluster` | ANY tag appearing in ≥5 threads (the `security` tag here) |

The empty fixture is intentionally a zero-byte file — `readJsonl` will return
`[]` so `ruleNoLogs` fires.

## Combining fixtures

To exercise multiple rules at once, copy several `logs/*.jsonl` files
together (they'll be concatenated into the same destination file) and then
overlay the thread fixtures into the threads catalog. All rules are
independent and additive.

## Privacy

Fixture entries follow the live log schema **exactly** (no `prompt` or
`response` body fields), so they double as visual proof of the privacy
invariant documented in `codex-log/SKILL.md` and `README.md`.

## Lifecycle — keep these files, don't delete them

**These are test inputs, not test outputs.** They live in the source tree
(`install/fixtures/analyze-rules/`) and are tracked by git. Total size is
~10 KB across 15 files — there is no storage cost to keeping them.

### Two distinct locations, don't confuse them

```
Permanent (git-tracked, do NOT delete)
└── install/fixtures/analyze-rules/
    ├── README.md
    ├── logs/*.jsonl
    └── threads/<rule>/*.json

Ephemeral (test runtime copy, wipe between scenarios)
└── ~/.claude/codex-on-claude/
    ├── logs/usage-YYYY-MM-DD.jsonl
    └── threads/*.json
```

The G7-5 test scenarios in `docs/test-scenarios-codex-calls.md` clear
`~/.claude/codex-on-claude/{logs,threads}/` between subcases — that wipe
targets the **runtime copy**, never the originals here.

### Why we keep them committed

1. **Regression alarm.** If someone changes a threshold in `analyze.mjs`
   (e.g. `>=3` → `>=5` for the large-responses rule), the matching fixture
   stops triggering its rule and G7-5b fails immediately. The fixtures
   force any threshold change to be conscious.
2. **Executable documentation.** Opening `large-direct-responses.jsonl`
   and seeing four entries with `responseChars` of 7500/12480/9300/15870
   plus `viaAgent:false` makes the rule's intent obvious — more so than
   prose in a SKILL.md.
3. **Deterministic CI.** A future `npm test` or CI job can run all nine
   rules in seconds by copying each fixture into a temp `$HOME` —
   no need to wait for organic Codex usage to accumulate.

### When to modify (and when not to)

Only edit these files when one of the three triggers below applies:

| Trigger | Action |
|---|---|
| New rule added to `analyze.mjs` | Add one new fixture file + a row in the table above + a `G7-5*` scenario in `docs/test-scenarios-codex-calls.md`. |
| Existing threshold changed | Adjust the affected fixture's line count or field values so it still trips the new threshold (e.g. if `>=3` becomes `>=5`, grow the 4-line fixture to 6). |
| Log schema field added | Add the new field to every JSONL line in `logs/*.jsonl` so `extractFromHookPayload` parity stays intact. |

Outside those three cases, **don't touch the fixtures**. Each one is a
frozen statement of intent; arbitrary edits erode the regression-alarm
property.

### What you can safely delete

- Anything you produced by *running* a test: copies under
  `~/.claude/codex-on-claude/`, logs in `/tmp/`, ephemeral reports in
  `~/.claude/codex-on-claude/reports/`. The G7-5 scenarios already
  contain the `rm -rf` commands for this.

### What you must never delete

- Anything inside `install/fixtures/analyze-rules/`. Removing the
  directory breaks G7-5 (nine analyzer-rule scenarios) and the
  "Running everything" loop in `docs/test-scenarios-codex-calls.md`.
