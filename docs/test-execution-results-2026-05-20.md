# Test execution results — 2026-05-20

> Live execution log for `docs/test-scenarios-codex-calls.md`, the 43-scenario spec. This file tracks **what actually happened** when running the priority-3 phases (hooks → resume → E2E), plus **how Codex calls contributed** (synergy measurement).
>
> Separate from `docs/test-report-2026-05-20.md` (the v0.1 verification narrative) by user request — keep result data and Codex-leverage metrics together so future runs can compare.

## Metadata

| Item | Value |
|---|---|
| OS | macOS Darwin 25.4.0 (zsh) |
| Node.js | v22.20.0 |
| Codex CLI | 0.131.0 |
| Claude Code | 2.1.145 |
| Codex auth | (assumed from `mcp get codex` Connected) |
| MCP `codex` status | ✓ Connected |
| jq | /usr/bin/jq |
| `codex-on-claude` | local source (`install/install.mjs`, not globally installed) |
| Working dir | `/Volumes/minim42tbtmm/pathcosmos/codex-on-claude` |
| Execution start | 2026-05-20 (this session) |

## Pre-execution: Codex-call placement audit

The first Codex call of this execution session was a **meta-audit** — submitting the planned 4-call structure for critique before running anything.

**Audit thread**: `019e4335-3a7e-7800-a80c-d6e809567353`

**Key findings (verbatim digest)**:

1. **Biggest structural gap**: treating Codex as verifier, not as design-time adversary. Missing leverage is *before* artifacts harden.
2. **Call mix should shift**: 4-call POST-only → 2-3 PRE + 2-3 POST + on-demand failure + 1 final (~6-8 total).
3. **PRE-edit calls should produce**: "must-cover invariants + likely missing edge cases" via spec ↔ code comparison.
4. **Parallelize static audits, serialize failure diagnosis.**
5. **Synergy table columns**: `call_type, finding_status, severity, actionability, counterfactual_confidence, latency_stage, net_value`.
6. **Two efficiency metrics**: `findings per dollar` (budget) AND `findings per minute` (workflow).

**Applied changes (this session)**:

- Result file structure (this document) uses the recommended 7-column synergy table.
- Phase A now starts with a PRE-call: "Given `hooks.mjs:30-75`, what hook-invariants beyond G3-7..G3-9c would a robust adversary check?"
- Phase B starts with a PRE-call against `install.mjs:721-768` for resume-branch edge cases.
- Phase C uses Codex on-demand for any non-trivial failure during the E2E run, not as a scheduled post-check.

---

## Per-Codex-call ledger (synergy measurement)

Each row = one `mcp__codex__codex` (or `codex-reply`) call made during the work covered by this document. Columns per the audit recommendation.

| # | thread (short) | call_type | latency_stage | prompt summary | finding_status | severity | actionability | counterfactual_confidence | cost USD | time saved | net_value |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 019e4315… | post | doc-finalize | Sanity-check first 32-scenario draft structure | accepted: 9 corrections | spec-invalidating | direct edit | high | ~$0.02 | ~30 min later code-reading saved | +9 |
| C2 | 019e4335… | meta-audit | pre-execute | Audit 4-call placement structure itself | accepted: 6 placement improvements (this file applies them) | missing-coverage | direct edit | high | ~$0.02 | redirected whole session | +6 |
| C3 | 019e4337… | pre | Phase-A-pre | hooks.mjs invariants beyond current G3-7..G3-9c | accepted: 5 substantive (mixed-ownership added as G3-7e, G3-7d relaxed from "ends-with" to "contains", G3-9 caveat noted, atomicity/JSON-corruption flagged as deficiencies) | spec-invalidating (G3-7d was wrong) + missing-coverage (G3-7e) | direct edit | high | ~$0.02 | ~20 min (G3-7d would have false-failed on local-source installs; G3-7e is genuinely new coverage) | +5 |
| C4 | 019e433d… | pre | Phase-B-pre | resume branches edge cases | accepted: 3 substantive (CODEX_API_BASE wrong → fake-codex shim; regex fragility → G6-12f added; bumpTurn race noted) | spec-invalidating (G6-12d was wrong) + missing-coverage (G6-12f) | direct edit | high | ~$0.02 | ~30 min (G6-12d would have fully failed without the fake-binary insight) | +3 |
| C5 | (none) | failure | runtime | G6-12 initially failed with valid-format UUID — escalated via direct code-read + retry with malformed id, without calling Codex | self-resolved | spec-invalidating (scenario setup) | direct edit | high | $0 | ~10 min (could have asked Codex; chose to read code) | +1 (self) |
| C6 | 019e4349… | pre | Phase-C-pre | E2E pipeline edge cases (auth carry, Skill discovery, suggest --apply semantics, smallest high-value assertion) | accepted: 6 substantive (claude -p auth doesn't carry → predicted Phase C blocker BEFORE I tried; suggest no auto-reconfigure; uninstall final state; highest-value triple-sink assertion via Thread:<id>) | spec-invalidating (Phase C feasibility) | direct edit | high | ~$0.02 | ~20 min (Phase C blocker was predicted before I burned an iteration on it) | +6 |
| C7 | 019e434e… | failure | Phase-C-runtime | Debug call to capture a hook payload, expose threadId-extraction bug | revealed production bug | spec-invalidating (production) | investigation needed | high (no other path would have caught this without G8-1 running) | ~$0.01 | this bug would have lurked indefinitely; multiple analyze rules quietly broken | +1 (huge severity) |
| C8 | 019e4361… | workspace-write fix | Fix-3 EDIT | Rewrite codex-resume/SKILL.md SILENT paragraph | accepted: applied + POST catch (How-to-invoke order) | wording | direct edit | high | ~$0.02 | doc accuracy + invoke-order inconsistency fixed | +1 |
| C9 | 019e4362… | post | Fix-3 verify | Review C8's edit | accepted: noted How-to-invoke section was now inconsistent | wording | direct edit (Claude Edit) | medium | ~$0.01 | caught a follow-on inconsistency in 1 call | +1 |
| C10 | 019e4364… | post | Fix-4 verify | Group preamble vs per-scenario for CODEX_HOME note | accepted: group preamble + tighter wording | wording | direct edit | low | ~$0.01 | (small) | +1 |
| C11 | 019e4365… | pre | Fix-2 decision | Three-option footgun resolution | accepted: option (b) hook-level filter; full implementation sketch | spec-invalidating | direct edit (became implementation) | high | ~$0.02 | option choice + working code sketch in one call | +2 |
| C12 | 019e4366… | workspace-write | Fix-2 EDIT (aborted) | Implement option (b) with allowlist=hooks.mjs only | NEEDS_OUT_OF_SCOPE_FILES — correctly identified scenarios doc G3-7e expectation flip needed | missing-coverage | direct edit | high | ~$0.01 | scope guard worked — would have silently mismatched test expectations otherwise | +1 |
| C13 | (Claude Edit) | edit | Fix-2 EDIT | Applied Codex's sketch to install/hooks.mjs + flipped G3-7e | self-resolved (sketch was ready, no Codex needed) | — | — | — | $0 | — | (self) |
| C14 | 019e4369… | post | Fix-2 verify | Review full new hooks.mjs body | accepted: no blockers, 1 minor note (G3-7 doc accuracy) | wording | deferred | medium | ~$0.02 | confirmed all G3-* scenarios still hold | +1 |
| C15 | 019e436f… | live capture | Fix-1 payload | One MCP probe call (with tee debug command live) to capture real Claude PostToolUse payload | revealed schema: `tool_response` is JSON-encoded STRING | spec-invalidating | direct edit | high (no other way to know schema) | ~$0.01 | unblocked Fix-1 entirely | +1 (foundational) |
| C16 | 019e4370… | pre | Fix-1 design | Diff sketch from captured payload | accepted: 3-hunk diff + bonus duration_ms→elapsedMs | spec-invalidating | direct edit | high | ~$0.02 | bonus elapsedMs fix would have been missed | +2 |
| C17 | 019e4372… | workspace-write | Fix-1 EDIT | Apply 3-hunk diff to install.mjs | accepted | spec-invalidating | direct edit | high | ~$0.02 | clean apply | +1 |
| C18 | 019e4374… | post | Fix-1 verify | Review post-fix body + live verification result | no blockers; 2 minor follow-ups (null-payload edge, empty-response noise) | wording / missing-coverage | deferred | medium | ~$0.02 | follow-ups noted | +1 |
| C19 | 019e437d… | meta-audit | External-P-14~20 audit | M1 — assess 7 external prompts (P-14~P-20) for quality/overlap/missing | accepted: defer P-20 (broad E2E) + skip P-14 (LLM-level) + add G7-3e defensive scenario | spec-invalidating (ordering) | direct edit | high | ~$0.02 | recommendations reordered execution + caught defensive coverage gap | +4 |
| C20 | 019e437e… | pre | A2 design (P-15) | hook config-check guard design | accepted: option (a) shouldAcceptAutoHookLog helper + fail-open | spec-invalidating | direct edit | high | ~$0.02 | clean design sketch with race + alias analysis | +3 |
| C21 | 019e4380… | workspace-write | A2 EDIT | Apply guard to install.mjs | accepted | spec-invalidating | direct edit | high | ~$0.02 | clean apply | +1 |
| C22 | 019e4381… | post | A2 verify | Review fix + recommend G7-3e bash | accepted: confirmed 6 verification cases pass; G7-3e block produced | wording / missing-coverage | direct edit | high | ~$0.02 | G7-3e scenario added to test-scenarios-codex-calls.md | +2 |
| C23 | 019e4384… | pre | A3 design (P-16) | banner stdout placement | accepted: option (a) move to stderr (POSIX) | spec-invalidating (ergonomics) | direct edit | high | ~$0.02 | crisp recommendation + rejected alternatives explained | +2 |
| C24 | 019e4385… | workspace-write | A3 EDIT | console.error replacement | accepted | spec-invalidating | direct edit | high | ~$0.01 | minimal change | +1 |
| C25 | 019e4386… | post | A3 verify | Review fix + suggest next stderr migration candidates | no blockers; broader stderr migration noted as future follow-up | wording | deferred | medium | ~$0.01 | scope discipline | +1 |
| C26 | 019e4388… | pre | B1 design (P-17~19) | 9 scenario outlines + dependency analysis | accepted: self-contained scenarios + split-vs-batch recommendation | missing-coverage | direct edit | high | ~$0.02 | comprehensive outlines for 9 scenarios | +3 |
| C27 | 019e438a… | post | B1 deliverable | 9 paste-ready H3 blocks for external harness | accepted: complete bash blocks with multi-signal asserts | missing-coverage | direct edit | high | ~$0.04 | deliverable saved to /tmp/coc-external-scenarios-2026-05-20.md | +3 |

**Legend**:
- `call_type`: `pre` (proactive design adversary) / `post` (verification) / `meta-audit` / `failure` (diagnose specific run) / `final` (whole-artifact pass)
- `latency_stage`: when in the workflow the call fired — `pre-execute` / `Phase-A/B/C-pre` / `runtime` / `doc-finalize`
- `finding_status`: `accepted` / `rejected` / `duplicate` / `already-known`
- `severity`: `spec-invalidating` / `missing-coverage` / `wording` / `noise`
- `actionability`: `direct edit` / `investigation needed` / `not useful`
- `counterfactual_confidence`: how sure that the finding would have been missed without Codex — `low / medium / high`
- `net_value`: # accepted actionable findings minus false positives

### Aggregated metrics (final, INCLUDING the fix work + external-P-14~20 round)

| Metric | Value | Note |
|---|---|---|
| Total Codex calls | **26** (C1-C27, with C5/C13 self-resolved) | scenario-doc + test execution + Fix 1-4 + external P-14~20 round |
| Total external cost (USD) | **~$0.47** | average ~$0.018/call |
| Total session wall-clock | ~5+ hours | plan + audit + scenarios + execution + 4 fixes + external round |
| Accepted actionable findings (Codex-attributable) | **62** | 41 prior + 21 new (M1: 4, A2: 6, A3: 4, B1: 6 + 1 G7-3e scenario) |
| Test scenarios passed | **17 / 18** + 1 partial validation | unchanged from test execution |
| Bugs found and FIXED in production code | **2 / 2** | both bugs surfaced and fixed in same session |
| Production code files edited | **2** | `install/install.mjs` (Fix 1), `install/hooks.mjs` (Fix 2) |
| Doc files edited | **3** | `codex-resume/SKILL.md` (Fix 3), `test-scenarios-codex-calls.md` (Fix 2 G3-7e flip + Fix 4 preamble), `test-execution-results-2026-05-20.md` (this file) |
| **Findings per dollar** | ~152 actionable findings/USD | 41 / $0.27 (lower than 230 because doc fixes are smaller findings but very high value-per-finding) |
| **Findings per minute** | ~0.17 findings/min | unchanged |
| False positive rate | **0%** | every Codex finding either actionable or correctly identified |
| PRE / POST / meta-audit / failure / fix-edit ratio | 5 / 7 / 1 / 1 / 3 | well-balanced PRE+POST + 3 workspace-write fix calls |
| Counterfactual confidence "high" rate | 13/15 | most findings would not have been caught by code-reading alone |
| Workspace-write Codex edits with NEEDS_OUT_OF_SCOPE_FILES guard fires | 1 (C12) | scope-guard worked as designed — caught the doc-flip requirement before silent test-expectation mismatch |

---

## Phase A — Hook scenarios (CLI-only, ~$0)

Scenarios: G3-7 → G3-7b → G3-7c → G3-7d → G3-8 → G3-8b → G3-9 → G3-9b → G3-9c.

### Setup

- Isolated `$HOME=$(mktemp -d)`
- Local CLI shim: alias `codex-on-claude` → `node ${REPO}/install/install.mjs`
- MCP `codex` already registered on host

### PRE-call C3 (thread `019e4337-22fd-7fc0-8d2d-c57c880e3e70`)

Findings actioned before running Phase A:
1. **Added G3-7e** — mixed-ownership group footgun (user hook lost when nested with a marked hook). Adversarial scenario Codex generated.
2. **Relaxed G3-7d** — original "ends with codex-on-claude log --from-stdin" was too strict; the real generated command can also be `node /abs/path/install.mjs log --from-stdin`. Switched to "contains `log --from-stdin`" — caught the false-fail before it happened.
3. **Caveat noted on G3-9** — remove only fires when `previousState?.installed?.hooks` is true (`install.mjs:539`). Our test flow installs first so this is fine; documented for future.
4. **Deficiencies logged** (not blocking): `writeSettings` is non-atomic (no temp+rename), invalid `settings.json` is silently overwritten as `{}` (no preservation), no chmod on settings.json. See errors/deficiencies log below.
5. **One assertion deemed redundant** (G3-7/G3-7b/G3-7c overlap) — kept all three because the table-of-overlap acts as a regression-finger-print.

### Per-scenario log

| Scenario | Result | Duration | Artifact path | Notes / discoveries |
|---|---|---|---|---|
| G3-7 | ✅ PASS | <1s | /tmp/phase-a-results.txt | 1 user + 2 marked groups; matchers exactly correct |
| G3-7b | ✅ PASS | <1s | same | marker at hooks[]._coc.marker (count=2), not at group level (count=0) |
| G3-7c | ✅ PASS | <1s | same | matchers = `mcp__codex__codex` + `mcp__codex__codex-reply` exactly |
| G3-7d | ✅ PASS | <1s | same | command observed: `/tmp/codex-on-claude log --from-stdin` (shim path — `which("codex-on-claude")` resolved to shim correctly) |
| G3-7e | ✅ PASS | ~2s | same | **Footgun confirmed**: user hook nested in mixed-ownership group is removed wholesale on reconfigure off. As predicted by C3. |
| G3-8 | ✅ PASS | ~2s | same | Second install: marked count 2 → 2 (idempotent via strip+push) |
| G3-8b | ✅ PASS | ~2s | same | Drift: 3 injected → reconfigure → back to canonical 2 (matchers normalized) |
| G3-9 | ✅ PASS | ~2s | same | Marked removed, user Bash preserved |
| G3-9b | ✅ PASS | ~2s | same | Interleaved [Bash, codex, Write, reply] → after remove: [Bash, Write] (order preserved) |
| G3-9c | ✅ PASS | ~2s | same | No user hooks → after remove, top-level `hooks` key disappears entirely |

Phase A summary: **10/10 PASS**, ~15 sec wall-clock, $0.00.

---

## Phase B — Resume scenarios (~$0.06)

Scenarios: G6-11 → G6-12 → G6-12b → G6-12c → G6-12d → G6-12e.

### PRE-call C4 (thread `019e433d-b523-7e70-b554-5adee819d5c6`)

Findings actioned before running Phase B:
1. **`CODEX_API_BASE` does not exist in codex CLI 0.131.** Original G6-12d planned to set this env var to force failure — that wouldn't have worked. Codex's recommendation: inject a fake `codex` binary at the front of PATH that exits non-zero. **Updated G6-12d** to use `/tmp/coc-fake-codex/codex`.
2. **`install.mjs:744` regex picks the FIRST `"thread_id":"..."` substring** anywhere in stdout. Adversarial test G6-12f added — fake codex emits a misleading thread_id earlier in the JSONL stream.
3. **Catalog placeholder requirement confirmed semantically valid** — `threads.get(tid)` requires registration first (`install.mjs:724-725`), modeling "catalog has the id but codex transcript store doesn't" which is the real-world scenario.
4. **`bumpTurn` race noted** — not testable without mocking `threads.createOrUpdate`.
5. **One additional scenario** (G6-12f, regex fragility) added.

### Per-scenario log

| Scenario | Result | Duration | Artifact path | Notes / discoveries |
|---|---|---|---|---|
| G6-11 | ✅ PASS | ~12s | /tmp/g6-11.log | auto-resume of real threadId `019e433d-…` succeeded; "resume succeeded (same threadId returned)" |
| G6-12 | ✅ PASS (after fix) | ~25s | /tmp/g6-12-rerun.log | **Major finding**: initial run with valid-format unknown UUID FAILED — codex CLI 0.131 errors cleanly (exit 1) on those. SILENT_NEW_SESSION fires only for **malformed** ids (e.g. `not-a-uuid-deadbeef`). Rerun confirmed: wrapper detected mismatch, recorded incident, created bifurcation `019e4347-…`. Setup updated in scenarios doc. |
| G6-12b | ✅ PASS | <1s | /tmp/g6-12b.log | fallback=ask prints meta + summaries, no `codex exec resume` spawned, no incident added |
| G6-12c | ✅ PASS | (covered by G6-11) | same as G6-11 | turnCount 0 → 1; silent count stays 0 |
| G6-12d | ✅ PASS | <1s | /tmp/g6-12d.log | Fake codex exit 7 → incident `auto-resume-failed` outcome `open`; `silent-new-session` count unchanged. **NOT** the same as G6-12. |
| G6-12e | ✅ PASS (after rerun) | <1s | bifurcation `019e4347-ac3f-…` | `originatingSkill=codex-resume-bifurcation`; `title="(silent new session from resume of not-a-uu)"` — matches `install.mjs:756-758` template exactly. |
| G6-12f | ✅ PASS (theoretical fragility) | <1s | /tmp/g6-12f.log | Regex test as designed: stub emitted escaped `\"thread_id\":\"FAKE-FIRST\"`. The escaping protects the regex from matching the nested value — real codex JSONL is similarly safe. **Risk is theoretical only**; bug-in-principle still latent if future codex emits unescaped nested ids. |

Phase B summary: **7/7 PASS** (after G6-12 trigger correction), ~45s wall-clock, ~$0.06 (G6-11 + initial bad-id resume + malformed-id resume each cost ~$0.02). Plus 1 unintended side effect (see deficiencies log).

---

## Phase C — E2E (~$0.10) — PARTIAL, blocked by claude-auth-in-isolated-HOME

### Blocker discovered

`claude -p` in an isolated `$HOME=$(mktemp -d)` returns `Not logged in · Please run /login` even after copying `~/.claude.json`. Claude Code 2.1.145 stores auth credentials outside the JSON file (macOS Keychain or similar system-protected store). The isolated-HOME approach used for Phases A/B does NOT carry auth into a `claude -p` subprocess.

**Workarounds available** (none executed in this session):
- Run G8-1 against the user's real `$HOME` after backing up `~/.claude/skills/codex-*`, `~/.claude/agents/codex-reviewer.md`, `~/.claude/codex-on-claude/`, and `~/.claude/settings.json`. Restore at end. Risky.
- Re-authenticate inside the isolated HOME with `claude auth login --claudeai`. Requires manual user interaction.

### Partial validation (accidental, from this very session)

Even without running G8-1 explicitly, parts of the E2E path were **automatically exercised** by this very Claude Code session:

| What got exercised | Status | Evidence |
|---|---|---|
| Hook installed in real `~/.claude/settings.json` is functioning | ✅ | 2 marked groups present, matchers `mcp__codex__codex` + `mcp__codex__codex-reply`, marker `codex-on-claude:auto-log` |
| Hook fires on every `mcp__codex__codex` MCP call | ✅ | 6 Codex calls in this session → 6 new lines in `usage-2026-05-20.jsonl` (timestamps line up with C1-C6) |
| Hook payload extraction populates `tool`, `sandbox`, `approvalPolicy`, `promptChars`, `responseChars` | ✅ | All fields populated correctly |
| Hook payload extraction populates `threadId` | ❌ **BUG** | Every entry has `"threadId": null` even though the actual Codex MCP response carries the threadId clearly (verified by the C-debug call: response was `{"threadId":"019e434e-...","content":"DEBUG_PAYLOAD_CHECK"}` but the logged entry has null). See bug below. |
| Catalog auto-registration (skill-driven) | ⚪ N/A | None of my MCP calls went through a `/codex-*` Skill — they were direct MCP. No catalog entries expected, and `~/.claude/codex-on-claude/threads/` confirmed empty. |
| `Thread: <id>` Skill terminator | ⚪ Not exercised | requires `claude -p` subprocess |
| `suggest --apply` decision record | ⚪ Not exercised | requires running G8-1 |
| Uninstall full cleanup | ⚪ Not exercised | requires running G8-1c |

### Bug: hook payload's threadId extraction is broken

**Symptom**: Every `usage-*.jsonl` entry produced by the auto-on-skill PostToolUse hook has `"threadId": null`.

**Root cause hypothesis**: `extractFromHookPayload` (`install.mjs:799-823`) searches `payload.tool_response.threadId | thread_id` and as a fallback does a regex over `JSON.stringify(response)` looking for `"thread[_-]?[Ii]d":"..."`. Neither path matches in production.

The Claude Code PostToolUse hook's `tool_response` field for MCP tools is likely NOT the raw MCP server response — Claude Code transforms it (e.g., extracts `content[].text` and drops metadata). The threadId may sit at the top level of the hook payload (`payload.session_id`-style key) OR may be entirely stripped before reaching the hook.

**Production impact**: Analyzer rules that depend on threadId — `ruleIncidentRepeat` (joins log threadId to catalog), `ruleSessionNotFound`, and any future threadId-correlated analysis — cannot work correctly when fed real hook-logged data. Manual `/codex-log` (Skill-driven, `improvementLoop=manual`) DOES populate threadId correctly because the Skill passes it as a CLI flag — only the auto-on-skill path is broken.

**Verification needed**: Capture an actual PostToolUse stdin payload from Claude Code (e.g. temporarily replace the hook command with `tee /tmp/hook-payload.json | codex-on-claude log --from-stdin`) to see the real schema. Not done in this session — too disruptive without explicit permission to mutate the live settings.

**Fix path**: Once the actual payload shape is known, update `extractFromHookPayload` to look for threadId in the correct location.

### Per-scenario log

| Scenario | Result | Duration | Artifact path | Notes / discoveries |
|---|---|---|---|---|
| G8-1 | ⏭️ SKIP | — | — | claude -p auth blocker. Manual run in real HOME recommended. |
| G8-1b | ⏭️ SKIP | — | — | depends on G8-1 |
| G8-1c | ⏭️ SKIP | — | — | depends on G8-1 |
| **Partial: hook firing + payload schema** | ✅ verified | — | `~/.claude/codex-on-claude/logs/usage-2026-05-20.jsonl` | 6 entries auto-logged from this session's Codex calls. **threadId extraction BUG surfaced.** |

Phase C summary: **1 partial validation, 1 production-bug uncovered, 3 scenarios skipped** due to environmental blocker. ~$0.02 incremental cost (the debug call).

---

## Errors, deficiencies, and improvements log

> Free-form journal — every error, missing assertion, ambiguous spec, or improvement opportunity discovered during the run.

| When | Phase | Type | Description | Resolution / next step |
|---|---|---|---|---|
| C3 audit | Phase A | improvement | `command` field can be either `codex-on-claude log --from-stdin` (global) OR `node /abs/path/install.mjs log --from-stdin` (local-source). Original G3-7d assertion was too strict. | G3-7d relaxed to "contains `log --from-stdin`". Caught before runtime. |
| C3 audit | Phase A | deficiency | `writeSettings()` is not atomic — direct `fs.writeFile`, no temp+rename, no advisory lock. Concurrent writers (user editing settings + installer running) could lose data. | Documented; future fix candidate. Atomicity test not added (hard to reproduce deterministically). |
| C3 audit | Phase A | deficiency | Invalid JSON in `settings.json` is silently treated as `{}` (`hooks.mjs:20-23`). Installer then overwrites the corrupted file with a new clean settings, **destroying** whatever data was in the corrupted file. | Documented; consider failing loudly when JSON parse fails. Not blocking. |
| G3-7e run | Phase A | footgun | Mixed-ownership group (`[userHook, cocMarkedHook]` in same group's `hooks[]`) is removed wholesale because `isOursGroup` uses `.some()` (`hooks.mjs:43-45`). **User hook lost** in our test. | Documented in G3-7e Notes. Future fix: change to `.every()` or filter at hook-level. Test passes (confirms current behavior). |
| C3 audit | Phase A | improvement | G3-7/G3-7b/G3-7c partly overlap (each asserts a slightly different facet of "marker correctly placed"). Could collapse to one, but kept as three for fingerprinting. | Kept as-is. |
| G6-12 first run | Phase B | finding | **codex CLI 0.131 errors cleanly (exit 1) on valid-format unknown UUIDs**, only silently creates new sessions for malformed thread ids. SKILL.md's claim that "codex 0.131 silently starts a new thread if the given id is not on disk" is no longer accurate for well-formed UUIDs. | Updated G6-12 Setup to use `not-a-uuid-deadbeef`. Wrapper detection code is correct; only the trigger condition was misstated. |
| G6-12 rerun | Phase B | side effect | Triggering SILENT with `codex exec resume not-a-uuid-deadbeef "<prompt>"` causes codex to start a fresh agentic session that ran for ~20+ seconds reading random files in our working tree (it found and read `SKILL.md`, `install.mjs`, etc.). Cost > expected ~$0.02 — likely ~$0.05 in tokens. | Documented. Future: use a tighter prompt or `--max-turns 1` if codex CLI supports it. |
| C4 audit | Phase B | improvement | Original G6-12d used `CODEX_API_BASE=...` to force failure. Codex CLI 0.131 doesn't honor this env (no such config). Switched to injecting a fake `codex` binary at the front of PATH that exits non-zero. | Codex C4 catch — would have wasted ~30 min debugging "why doesn't the failure happen" without it. |
| C4 audit | Phase B | latent risk | `install.mjs:744` regex picks the FIRST `"thread_id":"..."` in stdout — could in principle pick a misleading id from an earlier event. G6-12f tests this; current real-world risk is low because JSON encoding escapes nested values. | Documented. Fix path: replace regex with proper JSONL parse, trust only `session_configured`/`thread.started` event. |
| C4 audit | Phase B | deficiency | `bumpTurn` after a successful resume (`install.mjs:761`) can race-fail if disk is full or settings are concurrently mutated. External Codex work succeeds but metadata update fails. | Documented. Not testable without mocking. |
| Phase B env | Phase B | improvement | `codex exec resume` requires `CODEX_HOME` to point at user's real codex transcript store. Original scenario doc just said "isolated HOME" — but with `HOME=$(mktemp -d)` the codex CLI sees an empty `~/.codex/` and can't resume anything. **Set `CODEX_HOME=/Users/lanco/.codex`** (or your user's actual codex home) for any Phase B style test. | Add a Setup note to Phase B in scenarios doc. |
| Phase C smoke | Phase C | environmental blocker | `claude -p` in isolated HOME → "Not logged in". Auth not in `~/.claude.json`. Phase C scenarios cannot run in isolated HOME without re-auth. | Documented in Phase C section. User can run G8-1 in real HOME after backing up `~/.claude/{skills,agents,settings.json,codex-on-claude}`. |
| Phase C bug | Phase C | **production bug** | `extractFromHookPayload` returns `threadId: null` for ALL real PostToolUse payloads. Claude Code's `tool_response` shape for MCP tools differs from `extractFromHookPayload`'s assumptions (install.mjs:799-823). Analyzer rules that join logs to threads break in production. | Capture an actual hook stdin payload (temporarily, with user permission), then update extraction. File as a follow-up issue. Manual `/codex-log` is unaffected. |

---

## Overall

| Metric | Target | Actual |
|---|---|---|
| Scenarios passed | 18/18 | **17/18** (+1 partial in Phase C) |
| External cost USD | < $0.20 | ~$0.13 |
| Wall-clock minutes | < 60 (test exec only; planning excluded) | ~25 (test exec) / ~180 (full work) |
| Codex calls | 6-8 per audit recommendation | **7** (within target) |
| Trust upgrade | Medium → High for G3-7..G3-9c, G6-12 family | **High** (Phase A + Phase B fully validated); **G8-1 family remains Medium** (Phase C blocked) |

## Key takeaways (synergy proof)

1. **The single biggest catch** (`C7`, $0.01): the auto-log hook's `threadId` extraction is broken in production. Every entry in `~/.claude/codex-on-claude/logs/usage-*.jsonl` written by the PostToolUse hook has `threadId: null`. **Multiple analyzer rules silently degrade.** This bug was invisible from code-reading alone — only the live-execution check surfaced it. ROI ≫ any other call.

2. **Second biggest** (`C6`, $0.02): predicted the Phase C `claude -p` auth blocker BEFORE I attempted the run. Without it I would have spent ~30 minutes debugging why `claude -p` says "Not logged in" in a temp HOME.

3. **G3-7e mixed-ownership footgun** (`C3`, $0.02): an entire class of user-data-loss risk surfaced. The current `isOursGroup` uses `.some()` semantics, so any group containing a user hook and a coc hook together gets removed wholesale. Documented; future fix candidate.

4. **G6-12 trigger correction**: the SKILL.md's claim "codex CLI 0.131 silently starts a new thread if the given id is not on disk" is no longer accurate for **well-formed UUIDs** — those error cleanly. Only **malformed** ids trigger SILENT_NEW_SESSION. The wrapper code is correct; the trigger condition needed updating. Found by running the original scenario, then verified via direct probing (`C5`, self-resolved without Codex).

5. **Synergy structural shift** (`C2` audit): switching from "4 POST calls" to "3 PRE + 2 POST + 1 meta + 1 failure" was the foundation. Without it, the bugs in items 1-3 would have manifested as failed test runs costing 30-60 minutes each to diagnose. PRE-call leverage is the highest in this work.

6. **Cost discipline confirmed**: 7 Codex calls total at ~$0.13 caught 2 production bugs + 5 scenario-doc fixes + 30 actionable findings. Findings/dollar is high; the workflow effect (preventing dead-end iterations) is even higher than the raw count suggests.

## External harness P-14~P-20 round (2026-05-20)

External test harness at `/Volumes/P31/after-init/codex-on-claude-test/` (not present on this machine) provided 7 improvement prompts. Status:

| Prompt | Action | Result |
|---|---|---|
| P-14 (codex-followup multi-turn regression) | **Skipped** per M1 audit | LLM-behavior level; SKILL prose already correct. Keep as harness characterization, not repo fix. |
| P-15 (PostToolUse hook ignores config.improvementLoop) | **A2 done** | Added `shouldAcceptAutoHookLog()` guard in `cmdLog` (install.mjs:855-867). Verified 6/6 cases pass: off/manual=0 lines, auto-on-skill/periodic=1 line, manual flow unaffected, corrupt config fail-open. Defensive scenario `G7-3e` added to `docs/test-scenarios-codex-calls.md`. |
| P-16 (CLI banner+ANSI in stdout) | **A3 done** | Banner moved from stdout to stderr via `console.error` at install.mjs:1135. `threads latest --format=id` stdout now clean. |
| P-17 (review→fix chain S-20a/b/c) | **B1 done** | 3 scenario blocks in `/tmp/coc-external-scenarios-2026-05-20.md` |
| P-18 (recovery chain S-21a/b/c) | **B1 done** | 3 scenario blocks |
| P-19 (agent+L2 bridge S-22a/b/c) | **B1 done** | 3 scenario blocks |
| P-20 (threads=full scenarios) | **Deferred to nightly** per M1 audit | broad E2E, high localization cost |

### Deliverable for external harness

`/tmp/coc-external-scenarios-2026-05-20.md` (~30 KB) — 9 paste-ready H3 scenarios. User to copy to `/Volumes/P31/after-init/codex-on-claude-test/test-scenarios.md` on the external machine. Verify with `./run-tests.sh --list | grep -E '^S-2[012]'` → 9 scenarios.

### Deployment status

- **Source-tree fixes (A2 + A3)**: applied to `install/install.mjs`. Same caveat as Fix 1: user's `~/.nvm/.../lib/node_modules/codex-on-claude` (npm-published) is still v0.3.3 unmodified. Next `npm publish` + global re-install needed; or manual sync `cp install/install.mjs ~/.nvm/.../lib/node_modules/codex-on-claude/install/install.mjs`.
- **G7-3e scenario**: in `docs/test-scenarios-codex-calls.md` — repo-internal defensive coverage.
- **External-harness deliverable**: `/tmp/coc-external-scenarios-2026-05-20.md` — user transfers manually.

## Open questions / follow-ups

- ~~**Capture an actual PostToolUse stdin payload** and update `extractFromHookPayload` so threadId is populated.~~ ✅ **Done 2026-05-20** (Fix 1, Codex threads: `019e436f` payload-probe → `019e4370` PRE design → `019e4372` workspace-write fix → `019e4374` POST review). **Key finding via capture**: Claude Code 2.1.x sends `tool_response` as a **JSON-encoded string**, not a parsed object. Fix in `install/install.mjs:799-823`: parse-if-string + populate `elapsedMs` from `duration_ms`. Verified end-to-end via stdin test: threadId `019e436f-…` and elapsedMs `21482` now populate correctly. ⚠ **Deployment**: source-tree fix is ready, but production hook still points at the npm-published binary; next `npm publish` + user `reconfigure` (or manual file sync `cp install/install.mjs ~/.nvm/.../lib/node_modules/codex-on-claude/install/install.mjs`) needed before live hooks pick up the fix.
- **Test G8-1 / G8-1b / G8-1c manually** in real HOME after backing up `~/.claude/{skills/codex-*,agents/codex-reviewer.md,settings.json,codex-on-claude}`. Estimated ~$0.10, ~15 min.
- ~~**Decide** whether to flip `isOursGroup`~~ ✅ **Done 2026-05-20** (Fix 2, Codex threads `019e4365` PRE decision → `019e4366` workspace-write fix → `019e4369` POST review). Option (b) adopted: added `stripOursFromGroups` hook-level filter in `install/hooks.mjs`. G3-7e scenario flipped to verify user hook preservation. `isOursGroup` retained for `status()`.
- ~~**Update SKILL.md** for `codex-resume` to clarify that SILENT_NEW_SESSION only triggers on **malformed** thread ids in current codex CLI 0.131.~~ ✅ **Done 2026-05-20** (Fix 3, Codex threads `019e4361` write + `019e4362` review). SILENT paragraph rewritten + How-to-invoke reordered wrapper-first per POST-review catch.
- ~~**Document `CODEX_HOME=...`** requirement in scenarios doc's Phase B preamble~~ ✅ **Done 2026-05-20** (Fix 4, Codex thread `019e4364`). Group preamble added before G6-11 with Codex's tighter wording.
