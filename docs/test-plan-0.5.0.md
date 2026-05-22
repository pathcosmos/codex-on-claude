# v0.5.0 Test Plan

> **Date**: 2026-05-22
> **Scope**: Validate the v0.5.0 usage-mode integration before `npm publish` / GitHub release.
> **What was already done**: only smoke tests (syntax check, single `detectSignals` call, single `decideGate` call, single templater substitute). **Not sufficient for release.**
>
> Run this plan, capture results in [`test-execution-results-0.5.0.md`](test-execution-results-0.5.0.md) (create on first run), then decide whether to ship.

---

## Layered test strategy

| Layer | What it catches | Tooling | Time |
|---|---|---|---|
| **L1. Unit** | Pure-function correctness (detect-signals, decideGate, applyDecisionTree, mergeClassification) | Node `node:test` or ad-hoc | ~20 min |
| **L2. Module integration** | Templater + manifest schema + hooks.mjs PreToolUse/PostToolUse interleaving | Node + JSON validators | ~20 min |
| **L3. Installer flow** | install / reconfigure / status / uninstall paths with various flag combos, in an isolated `$HOME` | tempdir + `HOME=...` | ~40 min |
| **L4. End-to-end** | Real Claude Code session calling Codex MCP under each mode | live Claude Code + Codex CLI | ~30 min |
| **L5. Regression** | v0.4.x behavior preserved for existing users | external harness at `/Volumes/P31/after-init/codex-on-claude-test/` | ~20 min |

**Total**: ~2h to run cleanly. Each layer **must pass** before moving up.

---

## L1 — Unit tests (pure functions)

### L1.1 `detectSignals` — table-driven

Cover one input per signal class. Each row should hit exactly the signals listed.

| Test ID | Prompt | Expected output | Expected signals |
|---|---|---|---|
| L1.1.a | `"Review hooks.mjs for race conditions"` | — | `has_adversarial_defect=true` only |
| L1.1.b | `"1. parse JSON\n2. validate schema\n3. emit YAML"` | — | `has_chain=true` only |
| L1.1.c | `"Step 1: do X. Step 2: do Y."` | (inline steps) | `has_chain=true` |
| L1.1.d | `"Review this code"` | ` ```yaml\nfoo: bar\n``` ` | `has_strict_output=true` |
| L1.1.e | `"Review this code"` | `{"a":1,"b":2,"c":3,"d":4}` | `has_strict_output=true` (4+ quoted keys) |
| L1.1.f | `"Improve naming and formatting"` | — | `has_adversarial_defect=false` (style-only excluded) |
| L1.1.g | `"Make the failing tests pass"` | — | `has_tdd=true` |
| L1.1.h | `"Prove this algorithm is correct"` | — | `has_hard_reasoning=true` |
| L1.1.i | `null` / `undefined` | `null` | no exception, returns object with all false |
| L1.1.j | 25KB prompt | — | `is_long_context=true`, `prompt_length>20000` |

### L1.2 `applyDecisionTree` — mode × signals matrix

| Test ID | Mode | Signals | Expected recipe | Why |
|---|---|---|---|---|
| L1.2.a | `none` | any | `block` | mode override |
| L1.2.b | `synergy` | chain+strict | `R6` | Format-Safe Handoff |
| L1.2.c | `max` | chain+strict | `R4` | γ hot-swap |
| L1.2.d | `synergy` | adversarial only | `R1` | default review path |
| L1.2.e | `synergy` | hard-reasoning only | `R3` | reasoning=high |
| L1.2.f | `synergy` | tdd only | `R3` | reasoning=high |
| L1.2.g | `synergy` | known_alpha_ceiling=true, no adversarial | `alpha` | ceiling escape |
| L1.2.h | `synergy` | known_alpha_ceiling=true, adversarial=true | `R1` | adversarial overrides ceiling |
| L1.2.i | `max` | no β-favorable signals | `R5` | max always probes |
| L1.2.j | `auto` | no β-favorable signals | `alpha` w/ low confidence | Tier 2 trigger |

### L1.3 `decideGate` — `hooks.mjs`

| Test ID | Payload | Config mode | Expected |
|---|---|---|---|
| L1.3.a | `mcp__codex__codex` | `none` | `decision=deny`, reason mentions reconfigure |
| L1.3.b | `mcp__codex__codex-reply` | `none` | `decision=deny` |
| L1.3.c | `mcp__codex__codex` | `synergy` | `decision=allow` |
| L1.3.d | `mcp__codex__codex` | `max` | `decision=allow` |
| L1.3.e | `Read` (non-codex) | `none` | `decision=allow` (only gates codex tools) |
| L1.3.f | missing tool_name | `none` | `decision=allow` (fail-open on malformed payload) |
| L1.3.g | null config | `none` | `decision=allow` (no install yet → fail-open) |

### L1.4 `mergeClassification` — auto-probe.mjs

| Test ID | Tier1 result | Tier2 classification | Expected recipe |
|---|---|---|---|
| L1.4.a | `alpha`/conf=0.5 | `chain-strict` | `R6` |
| L1.4.b | `alpha`/conf=0.5 | `adversarial-review` | `R1` |
| L1.4.c | `alpha`/conf=0.5 | `other` | unchanged (tier1) |
| L1.4.d | `alpha`/conf=0.5 | `null` (probe failed) | unchanged (tier1) |

### L1.5 — Driver script

Write `install/fixtures/v05-unit-tests.mjs` invoking all of L1.1–L1.4 via `node:test`. **Exit non-zero on any failure.** Capture stdout to `test-execution-results-0.5.0.md`.

---

## L2 — Module integration

### L2.1 Manifest schema validity
- `node -e "JSON.parse(require('fs').readFileSync('install/manifest.json','utf8'))"` → no error
- `usageMode.choices[].key` ∈ {`none`,`synergy`,`auto`,`max`} (no typos)
- `autoTier2LLMProbe.choices[].key` ∈ {`on`,`off`}
- All choice labels are non-empty strings

### L2.2 Templater + manifest placeholder coverage
- For each SKILL.md and agent .md: ensure `{{usageMode}}` appears at least once
- Run `install/templater.mjs:substitute()` with synthetic `buildModelVars` output on each `.md`
- Assert no `{{` remains in any output (no missing placeholders)

### L2.3 Hooks.mjs idempotency
- Empty `~/.claude/settings.json` (use a temp HOME)
- `install({command: "x"})` then `install({command: "y"})` → only one set of PostToolUse groups (with command="y")
- `installGate({command: "g1"})` then `installGate({command: "g2"})` → only one set of PreToolUse gate groups (with command="g2")
- `remove()` then `removeGate()` → settings.json has no `_coc` markers left
- Mixed: user adds a non-`_coc` hook, install ours, remove ours → user hook preserved

### L2.4 Driver script
Write `install/fixtures/v05-integration-tests.mjs`. Same exit-non-zero discipline.

---

## L3 — Installer flow (isolated $HOME)

**Setup once**: `export TMPHOME=$(mktemp -d) && export HOME=$TMPHOME && mkdir -p $HOME/.claude`. Reset between scenarios with `rm -rf $TMPHOME/.claude`.

### L3.1 Fresh install — `--usage-mode=synergy --yes`
- Expect: `config.json.choices.usageMode === "synergy"`, `gateHooks` absent or false
- `~/.claude/settings.json` has no PreToolUse gate entries
- All 9 SKILL.md installed with rendered `## Usage mode (v0.5.0)` → `synergy` text

### L3.2 Fresh install — `--usage-mode=none --yes`
- Expect: `usageMode === "none"`, `gateHooks === true`
- `~/.claude/settings.json` has 2 PreToolUse groups with `_coc.marker === "codex-on-claude:usage-gate"`
- Rendered SKILL.md shows the "none" branch text in `## Usage mode`

### L3.3 Fresh install — `--usage-mode=max --auto-tier2-llm-probe=on --yes`
- Expect: `usageMode === "max"`, `autoTier2LLMProbe === true`

### L3.4 Silent migration (the big one)
- Hand-craft `~/.claude/codex-on-claude/config.json` mimicking a v0.4.1 install (no `usageMode` field)
- Run `node install/install.mjs --yes` (NOT `reconfigure`)
- Expect: usageMode silent-filled to `synergy`, **no §7 prompt printed**, info line "usageMode: silent default 'synergy' applied for upgrade"
- `config.json` post-run contains `usageMode: "synergy"` + `autoTier2LLMProbe: true`

### L3.5 Explicit reconfigure surfaces prompt
- Same starting state as L3.4
- Run `node install/install.mjs reconfigure` (interactive — pipe `Enter Enter ... Enter` or use `--usage-mode=auto --yes`)
- Expect: §7 prompt visible (or flag honored), updated config

### L3.6 Mode switch synergy → none → synergy
- Start at synergy
- `reconfigure --usage-mode=none --yes` → gate registered
- `reconfigure --usage-mode=synergy --yes` → gate removed, `installed.gateHooks === false`

### L3.7 Status output
- Run `status` after each L3.1–L3.6
- Verify `usageMode:` row appears + correct PreToolUse gate count

### L3.8 Uninstall cleanup
- After L3.2 (mode=none with gate active)
- Run `node install/install.mjs uninstall`
- Expect: gate hooks removed; `removed` list includes `hooks/PreToolUse-gate (2)`
- `~/.claude/settings.json` has no `_coc` markers

### L3.9 Reconfigure persists subscription/model fields untouched
- v0.4.1 install with `--subscription-claude=pro --codex-model-primary=gpt-5`
- Reconfigure to change only `--usage-mode=max`
- Expect: subscription + model untouched, only usageMode changes

### L3.10 Drift guard
- Manually edit `install/manifest.json` to version `0.4.9`, leave `package.json` at `0.5.0`
- Run installer → warn message + uses `0.5.0` for banner and state
- Revert manifest

### L3.11 Bad-input validation
- `--usage-mode=foo` → exit 2 with error listing allowed values
- `--auto-tier2-llm-probe=maybe` → exit 2 with error

### L3.12 Driver script
Write `install/fixtures/v05-installer-flow.sh` that does each scenario in a temp HOME, captures output, asserts on the JSON state file.

---

## L4 — End-to-end (real Claude Code session)

These require an actual machine with Claude Code 2.1.x + Codex CLI logged in. Don't automate — manual checklist + screenshots.

### L4.1 mode=none — gate blocks live call
1. `npx --yes codex-on-claude@latest reconfigure --usage-mode=none --yes`
2. Open Claude Code, invoke `/codex-review` on any file
3. **Expected**: Claude Code displays a `decision=deny` message with the reason string from `decideGate`. Claude must not call Codex.

### L4.2 mode=synergy — adversarial review fires R1
1. Reconfigure to `synergy`
2. In Claude Code: "Review hooks.mjs for race conditions and contradictions with documented assumptions."
3. **Expected**: `/codex-review` Skill or `codex-reviewer` agent invokes Codex with R1 adversarial framing. Logged in `usage-*.jsonl`.

### L4.3 mode=auto — Tier 1 confident
1. Reconfigure to `auto`
2. Prompt clearly chain+strict: "Step 1 parse. Step 2 validate. Output strict JSON: { ... }"
3. **Expected**: detect-signals fires `has_chain + has_strict_output`. Tier 2 probe **NOT** invoked (confidence ≥ 0.7). Decision = R6.

### L4.4 mode=auto — Tier 2 fires on ambiguous
1. Reconfigure to `auto` with `--auto-tier2-llm-probe=on`
2. Ambiguous prompt: "Help me understand this code"
3. **Expected**: Tier 1 confidence < 0.7 → Tier 2 probe invoked → entry in `~/.claude/codex-on-claude/logs/auto-probe.jsonl`

### L4.5 mode=max — R5 always probe
1. Reconfigure to `max`
2. Run a routine task without strong signals
3. **Expected**: R5 cheap β trial fires; either adoption (source-grounded finding) or revert to α

### L4.6 max + chain+strict → R6 (catastrophe guard holds)
1. mode=max
2. Prompt that's both chain+strict AND adversarial
3. **Expected**: R6 Format-Safe Handoff (Codex prose → Claude format), NOT direct strict-JSON Codex call

### L4.7 P-Turn-Burn enforced
1. Any mode (except none)
2. Start a `/codex-followup` chain, run 5+ followups without new context
3. **Expected**: After turn 3, Skill prose surfaces stop guidance

---

## L5 — Regression (existing user perspective)

### L5.1 v0.4.1 → v0.5.0 silent upgrade
- Install v0.4.1 from npm in a tempdir, configure with `--subscription-claude=pro --codex-model-primary=gpt-5 --improvement-loop=auto-on-skill`
- Run v0.5.0 installer (this repo) — no flags
- **Expected**:
  - banner shows `v0.4.1 → v0.5.0`
  - silent-fill info line about usageMode
  - PostToolUse hook command path stays correct
  - `config.json.choices.usageMode === "synergy"` (silent default)
  - `config.json.choices.subscription` + `model` untouched
  - Skills re-rendered with new preamble (no `{{...}}` remaining)
- Open Claude Code → existing `/codex-review` flow works exactly as before

### L5.2 External harness
- `cd /Volumes/P31/after-init/codex-on-claude-test/`
- Run the regression suite
- **Expected**: no scenario newly fails. Document any newly fixed scenarios (intentional).

### L5.3 Hook-payload drift check
- v0.3.4 added `JSON.parse(response)` for `tool_response` strings + `duration_ms` extraction. Confirm v0.5.0 still emits `threadId` and `elapsedMs` correctly in `usage-*.jsonl`.

---

## Pass / fail criteria

**Hard ship blockers** (any fails → don't release):
- All L1 unit tests pass
- L2.3 idempotency holds (mixed user-hook preservation matters)
- L3.4 silent migration produces no §7 prompt + correct config
- L3.8 uninstall removes all `_coc` markers
- L4.1 gate denies live `mcp__codex__codex` in mode=none
- L5.1 existing v0.4.1 install upgrades cleanly with no behavior change

**Soft blockers** (fix but may ship with workaround note):
- L3.10 drift guard message
- L3.11 bad-input messages
- L4.3 confidence threshold (might need tuning)
- L4.4 probe latency (might warrant a `--auto-probe-timeout-ms` flag)

**Document but don't block**:
- L4.5 R5 behavior is intentionally noisy
- L4.7 P-Turn-Burn relies on Skill prose, not hooks

---

## Execution order

```
L1 unit (20 min)
  └─ if pass →
L2 integration (20 min)
  └─ if pass →
L3 installer flow (40 min) ← isolated $HOME, scripted
  └─ if pass →
L4 E2E (30 min) ← manual, requires live Claude Code + Codex CLI
  └─ if pass →
L5 regression (20 min)
  └─ if pass → SHIP
```

If L1 or L2 fails: fix the corresponding source, re-run from L1.
If L3 fails: fix install.mjs / manifest, re-run from L3.
If L4 fails: usually a Skill prose problem — fix the SKILL.md, re-run from L3.1 (to re-render Skills) then L4.
If L5 fails: this is the most expensive failure to debug — open the v0.4.1 install state, diff against v0.5.0 install state, isolate the divergent field.

---

## Test artifact location

| Output | Path |
|---|---|
| Driver scripts | `install/fixtures/v05-{unit,integration,installer-flow}.{mjs,sh}` |
| Execution log | `docs/test-execution-results-0.5.0.md` (create on first run) |
| L4 manual notes | `docs/test-execution-results-0.5.0.md` § "L4 Manual notes" |
| Regression diff | append to `docs/test-execution-results-0.5.0.md` § "L5 vs v0.4.1" |

---

## What to do AFTER this plan passes

1. Run `git status` + `git diff` review (or `/codex-review` for extra eyes)
2. Update `CHANGELOG.md` if any spec changed during testing
3. Tag `git tag v0.5.0`
4. `npm publish` (or first `npm publish --dry-run` to inspect tarball)
5. GitHub release with `docs/release-notes-0.5.0.md` body
6. Announce to existing users (silent migration means no breakage, but mention the new `--usage-mode` flag)
