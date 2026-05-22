# codex-on-claude v0.5.0 — Release Notes

> **Date**: 2026-05-22
> **Theme**: Codex invocation policy (`none / synergy / auto / max`) — applied at install, reconfigure, and runtime.
>
> Companion: [`CHANGELOG.md`](../CHANGELOG.md) (terse), [`docs/usage-mode-config.md`](usage-mode-config.md) (spec), [`docs/guidance-quick-ref.md`](guidance-quick-ref.md) (30-second card).

---

## TL;DR

```sh
# Existing users — silent migration to 'synergy' (current behavior preserved)
npx --yes codex-on-claude@latest

# To opt into a different policy
codex-on-claude reconfigure --usage-mode=max --yes

# Strict privacy / cost-bound — Codex calls blocked at the PreToolUse gate
codex-on-claude reconfigure --usage-mode=none --yes
```

The big change: **codex-on-claude now ships a 4-mode policy that shapes how aggressively Claude consults Codex**. Until v0.4.x the answer was always "as the Skill prose decides"; v0.5.0 lets you set the dial.

---

## The 4 modes

| Mode | One-liner | Best for | Cost overhead vs α-only |
|---|---|---|---|
| `none` | Codex calls blocked at PreToolUse gate | privacy / strict cost-sensitive | 1.0× (no Codex) |
| `synergy` (**default**) | Follow v9 guidance (Quick-Ref 3-Q tree + R1–R6 recipes) | 90% of users | 1.0–1.3× |
| `auto` | Tier 1 heuristic + optional Tier 2 LLM probe ($0.01–0.02) | power users who want classification automation | 1.1–1.4× |
| `max` | Quality-first bounded automation; R1 default ON, R5 always probe, γ hot-swap auto | critical tasks where +5–10pp matters | 2.0–4.0× |

**Hard DO-NOT rules are enforced in every mode**:
- `chainJsonTrap` — Chain-JSON Trap blocked even in `max` (routed to R6 Format-Safe Handoff)
- `subagentStrict` — Subagent + strict JSON blocked
- `turnBurn` — 3-turn stop rule for multi-turn followups
- `ceilingNoUpside` — Warn-and-skip when α is already at 100%

---

## What's new under the hood

### Install / reconfigure flow

- **manifest.json** gets a new `usageMode` question (single-select × 4) + `autoTier2LLMProbe` (single-select × 2) + an info-only `guardrails` defaults block.
- **install.mjs** is patched in 6 places: defaults computation, CLI flag parsing (`--usage-mode`, `--auto-tier2-llm-probe`), interactive prompt (skipped on silent migration), review-table render, apply-summary log, and the migration silent-fill branch.
- **status output** shows the active mode + Tier 2 probe state + PreToolUse gate hook count.

### Runtime modules

- **`install/detect-signals.mjs`** — pure Tier 1 heuristic classifier. Detects chain-step structure (numbered / lettered / first-then-finally / step N variants), strict-output cues (JSON / YAML / CSV / TS schema + 4+ quoted keys), adversarial defect framing (excluding pure style review), TDD, hard reasoning, and long-context.
- **`install/auto-probe.mjs`** — Tier 2 LLM probe via `codex exec --sandbox=read-only --json`. Only fires in `auto` mode when Tier 1 confidence < 0.7 AND `autoTier2LLMProbe === true`. Logs every probe to `~/.claude/codex-on-claude/logs/auto-probe.jsonl` (event, latency, classification).
- **`codex-on-claude gate --from-stdin`** — new sub-command serving as the PreToolUse hook handler. Reads Claude Code's hook payload, consults config, writes `{decision, reason}` JSON when calls should be blocked.

### Hook integration

- **PreToolUse gate** — registered in `~/.claude/settings.json` **only** when `usageMode === "none"`. Two hook groups (post pre-ship hardening): one wildcard regex matcher `mcp__codex__.*` (covers all current + future Codex MCP tool variants, plus case-insensitive match in `decideGate`), and one `Bash` matcher that inspects `tool_input.command` for `codex exec` / `codex-on-claude threads resume` / `npx codex` / shell-wrapper bypasses (`eval "codex ..."`, `sh -c '...'`, `bash -lc '...'`, backtick subshells, etc.). Each hook command embeds `--enforce-mode=none` so the deny decision is race-free against `config.json`. Each carries a `_coc.marker = "codex-on-claude:usage-gate"` sentinel so uninstall + reconfigure remove only our entries (and reconcile against the actual settings.json state regardless of `installed.gateHooks` claim — B5 fix).
- **PostToolUse logging hooks** (v0.3.4+) continue to work — the v0.5.0 changes are additive.

### Skill prose

All 9 SKILL.md files now begin with a compact `## Usage mode (v0.5.0)` section that branches on `{{usageMode}}`. The branch text covers:
- `none` — what to tell the user + α-only fallback
- `synergy` — which Quick-Ref leaf applies
- `auto` — whether to invoke `detect-signals.mjs` first
- `max` — which recipes fire by default, R6 Format-Safe Handoff when chain+strict

`codex-log` and `codex-threads` (catalog half) remain allowed in `none` because they operate on local files only.

### Both reviewer agents updated

- `codex-reviewer.md` and `codex-reviewer-fallback.md` refuse to start in `none` mode with a single explanatory line. In `synergy / auto / max` they honor the **P-Subagent-Strict guardrail**: when the caller asks for strict-JSON output, the agent emits prose (R1 framing) and lets the main Claude session reformat (R6 Format-Safe Handoff).

### Analyzer

- New rule `ruleUsageModeDrift` (`install/analyze.mjs`) — surfaces:
  - `usage-mode-drift-none`: mode=none but Codex calls were logged → likely a stale binary or settings.json edit
  - `usage-mode-drift-max-idle`: mode=max but zero calls in the window → either no eligible tasks or the user should consider stepping down to `synergy`

---

## Migration guide

### For existing users (0.4.x → 0.5.0)

**Nothing changes by default.** When you run `npx --yes codex-on-claude@latest` the installer:

1. Reads your existing `~/.claude/codex-on-claude/config.json`
2. Detects no `usageMode` field
3. Silently sets `usageMode: "synergy"` (matches your prior behavior)
4. Silently sets `autoTier2LLMProbe: true` (irrelevant unless you switch to `auto`)
5. Updates Skill prose to include the new `## Usage mode (v0.5.0)` section (transparent — Claude reads `{{usageMode}}` and behaves as before)
6. Does **not** add a PreToolUse hook (only added when `usageMode === "none"`)

Run `codex-on-claude status` to confirm:

```
codex-on-claude status
  ...
  usageMode: synergy
  PreToolUse gate: (none)
```

### To switch modes

```sh
codex-on-claude reconfigure                       # interactive — surfaces §7 prompt
codex-on-claude reconfigure --usage-mode=max --yes
codex-on-claude reconfigure --usage-mode=none --yes   # adds PreToolUse gate
```

### To revert

```sh
codex-on-claude reconfigure --usage-mode=synergy --yes
```

### Power-user quick recipes

```sh
# Strict cost-down: no Codex anywhere, no probes
codex-on-claude reconfigure --usage-mode=none --auto-tier2-llm-probe=off --yes

# Critical task — max with classifier
codex-on-claude reconfigure --usage-mode=max --auto-tier2-llm-probe=on --yes

# Auto mode without budget burn (Tier 1 only)
codex-on-claude reconfigure --usage-mode=auto --auto-tier2-llm-probe=off --yes
```

---

## Post-L6 hardening (14 fixes between initial implementation and ship)

After the initial v0.5.0 implementation, a comprehensive verification cycle (L1–L6 in `docs/test-plan-0.5.0.md`) ran 129 automated test cases + 7 Codex peer reviews + 1 adversarial security review. The reviews surfaced 14 follow-up issues; **all were fixed before ship**:

### F-series — found by L6.1 Codex peer review + L6.2 adversarial review (Critical + High)

| ID | Severity | Fix |
|---|---|---|
| F1 | 🔴 Critical | **Wildcard MCP matcher** (`mcp__codex__.*`) + case-insensitive `decideGate` — closes the bypass via `mcp__codex__codex_reply` or future Codex MCP tool names, and `MCP__CODEX__CODEX` case-swap |
| F2 | 🔴 Critical | **Bash PreToolUse matcher** — denies `codex exec`, `codex-on-claude threads resume`, `npx ...codex...`, path-qualified codex binaries. Closes the major CLI bypass attack. |
| F3 | 🔴 Critical | **`cmdGate` fail-CLOSED for Codex-shaped tools** — when payload is malformed JSON or `config.json` is unreadable, deny rather than allow. Non-Codex tools still fail-open. |
| F4 | 🟠 High | **`auto-probe.mjs` JSONL parsing** — `codex exec --json` emits JSON Lines (not a single document). Old code regexed the raw stdout for ` ```json` which never matched. New parser walks JSONL events, extracts `agent_message` content, then finds the fenced block. |
| F5 | 🟠 High | **R4 vs R6 alignment** — Skill prose was claiming R6 (Format-Safe Handoff) for `max+chain+strict` but code returned R4 (γ hot-swap). Aligned to R4 per spec; R6 remains the synergy-mode equivalent. |
| F6 | 🟡 Medium | **`buildModelVars` TDZ self-reference bug** — `}[mode] || modeBehavior?.synergy` referenced the variable being declared. Refactored into a separate `modeBehaviorTable` const. |
| F7 | 🟡 Medium | **`docs/usage-mode-config.md` drift** — `none` mode described as interactive confirm (wrong; it's a hard block) + "5 recipes" stale text (actual: R1–R6). |
| F8 | 🟢 Soft | **detect-signals plural regex** — added `s?` for "race conditions" and "failing tests" so common natural phrasings match. |

### G-series — quick-win UX/correctness items deferred from F-series triage

| ID | Fix |
|---|---|
| G1 | **CLI positional validation.** `--usage-mode max` (space-separated) now errors with hint. Use `--usage-mode=max`. Implementation: known-subcommand allowlist in `main()`. |
| G2 | **Silent-fill info line reachable.** Auto-detected reconfigure (npx upgrade path) emits `usageMode: silent default 'synergy' applied for upgrade`. Explicit `coc reconfigure` still surfaces §7 prompt. Implementation: `isExplicitReconfigure` flag distinguishes the two paths. |
| G3 | **`usageMode` stamped on every log row.** `cmdLog` + `extractFromHookPayload` read config and inject the active mode. Powers ruleUsageModeDrift accuracy. |
| G4 | **`docs/usage-mode-config.md:120`** — stale `--mode=manual` flag reference replaced with `--usage-mode=…` example. |
| G5 | **TDD regex precision.** "edge cases" alone no longer triggers `has_tdd=true`. Only `failing test(s)`, `make tests pass`, `tdd` keyword qualify. |
| G6 | **Dead-code `stripOursFromGroups` removed** from `hooks.mjs` (superseded by `stripOursFromGroupsByMarker`). |
| G7 | **`ruleUsageModeDrift` filters by `config.updatedAt`.** Eliminates immediate false-positive after mode-switch (historical logs from prior mode no longer count). |

### H-series — all v0.5.1 deferred items implemented pre-ship

The user explicitly requested implementing every remaining deferred item before shipping — the original v0.5.1 candidates became v0.5.0 finals:

| ID | Fix |
|---|---|
| H1 | **Dual hook decision shape.** `cmdGate` emits both legacy `{decision, reason}` AND `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason}}` so the gate works against Claude Code 2.1.x + future versions. Hard-denies (Codex-shaped) additionally write to stderr + `process.exit(2)` as a backstop. |
| H2 | **Race-free gate** (`--enforce-mode=none` baked into hook command at install time — the gate never reads `config.json`, eliminating toggle-race) + **atomic config writes** (`saveState`, `writeSettings`, `threads.writeJson` use temp+rename — concurrent readers never observe torn JSON). |
| H3 | **Gate state reconciliation.** Every reconfigure inspects `~/.claude/settings.json` itself; orphan gate entries from manual edits or stale state are cleaned up automatically regardless of `installed.gateHooks` claim. |
| H4 | **`detect-signals` "table" precision.** Requires output-intent context (e.g. "format as a table", "return ... table") instead of any bare mention. Prevents false-positive on "inspect the routing table". |
| H5 | **Adversarial preserved when mixed with style.** "Find security bugs and naming issues" now correctly flags adversarial (policy: adversarial token presence wins over style-only suppression). |
| H6 | **Unquoted field-list detection.** "Return exactly fields: status, risk, file, line" (3+ comma-separated identifiers after `fields:`/`keys:`/`columns:`) now flags strict-output. |
| H7 | **State directories 0700.** All `~/.claude/codex-on-claude/{,logs,reports,improvements,threads}` chmod'd to user-only at install time. Best-effort for filesystems that ignore chmod. |

### Verification matrix

| Layer | Cases | Status |
|---|---|---|
| L1 Unit (`install/fixtures/v05/unit/`) | 81 | ✅ PASS |
| L2 Integration (`install/fixtures/v05/integration/`) | 31 | ✅ PASS |
| L3 Installer-flow (`install/fixtures/v05/installer-flow/`) | 15 | ✅ PASS |
| L5 Regression (`install/fixtures/v05/regression/`) | 2 (7 internal cases) | ✅ PASS |
| **Total automated** | **129** | **✅ 100% PASS** |
| L4 Manual E2E (live Claude Code) | 10 | ⏳ User runs |
| L6.1 Codex multi-thread peer review | 7 areas | ✅ All findings fixed (F1-F8) |
| L6.2 Adversarial bypass review | 5 attack paths | ✅ 3 High mitigated; 2 Medium implemented as H1/H2 |
| L6.3 Sub-agent parallel verification | 5 agents | ✅ All consistency checks PASS |

Run commands:

```sh
node install/fixtures/v05/unit/run-units.mjs
node install/fixtures/v05/integration/run-integration.mjs
bash install/fixtures/v05/installer-flow/run-flow.sh
bash install/fixtures/v05/regression/run-regression.sh
```

---

## Known limitations

1. **Tier 2 LLM probe adds latency + cost.** ~$0.01–0.02 per probe, 1–3s latency. Disable via `--auto-tier2-llm-probe=off` or pick `synergy` instead of `auto`.
2. **Most guardrails live in Skill prose, not hooks.** The PreToolUse gate is the only hard enforcement layer (mode=none). Chain-JSON Trap, Subagent-Strict, Turn Burn are encoded as prose guidance — an LLM that ignores the prose won't be blocked. Deeper hook integration is deferred to a future release.
3. **`max` mode does NOT override hard DO-NOT rules.** Chain+strict prompts get routed to R6 Format-Safe Handoff rather than letting Codex emit strict JSON. This is intentional — v6/v8 data showed -16~-83pp catastrophe risk for unprotected chain+strict.
4. **Auto-probe budget is not capped.** Per-day or per-session budget tracking is deferred. The probe log lets you measure cost manually via `wc -l ~/.claude/codex-on-claude/logs/auto-probe.jsonl`.
5. **The synergy default for migrated installs may not match aggressive-use preferences.** Run `codex-on-claude reconfigure --usage-mode=max --yes` if you want the upgrade to bias toward β probing.

---

## Verification (recommended after upgrade)

```sh
# 1. Confirm version + mode picked up
codex-on-claude status

# 2. Try the Tier 1 heuristic
node ~/path/to/codex-on-claude/install/detect-signals.mjs "review hooks.mjs for race conditions" "" synergy

# 3. (Optional) Try the Tier 2 probe — requires codex CLI logged in
node ~/path/to/codex-on-claude/install/auto-probe.mjs "Implement a SAT solver that minimizes the number of clauses"

# 4. Test mode=none blocks calls
codex-on-claude reconfigure --usage-mode=none --yes
# In Claude Code: ask for /codex-review on a file
# Expect: structured deny message from the PreToolUse hook

# 5. Revert
codex-on-claude reconfigure --usage-mode=synergy --yes
```

---

## Credits

- v9 practitioner audit + synergy-maximization rebalancing fed the policy modes.
- v8 cross-domain validation sweep (AV01 / AV05) confirmed adversarial framing generalizes beyond T12.
- Codex peer review on the spec caught the original Chain-JSON Trap in R1 (fixed via R6 Format-Safe Handoff).
- 771 result.json runs across 217 scenarios (~$100–115 measured external cost) underwrite every claim.

Issues / discussion: <https://github.com/pathcosmos/codex-on-claude/issues>.
