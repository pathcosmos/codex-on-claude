# v0.5.0 Security Review — `usageMode=none` Gate Bypass Analysis

> **Date**: 2026-05-22 (updated 2026-05-22 post pre-ship audit)
> **Reviewer**: Codex CLI (adversarial framing, R6 Format-Safe Handoff) + pre-ship audit pass (3 sub-agents + Codex peer review)
> **Status**: **All 5 attack paths mitigated before ship.** 3 High (F1, F2, F3) + 2 Medium (H1, H2) all implemented as code in v0.5.0.
> **Companion**: [`test-execution-results-0.5.0.md`](test-execution-results-0.5.0.md), [`release-notes-0.5.0.md`](release-notes-0.5.0.md)

## Threat model

The user has run `codex-on-claude reconfigure --usage-mode=none --yes`. They (or an LLM acting on their behalf) want to invoke Codex anyway. The PreToolUse gate hook in `~/.claude/settings.json` is the only enforcement layer; Skill prose is advisory.

In-scope attacks:
- Prompt-engineering attacks (LLM ignoring Skill prose)
- Payload edge cases (case, alternate field names, malformed JSON)
- Hook spec edge cases (decision shape, matcher patterns)
- State coupling bugs (corrupt config, symlinks, races)
- CLI bypass (Bash/shell paths around MCP)

Out-of-scope (by design escapes):
- User changes mode back to synergy
- User deletes config.json
- User edits `~/.claude/settings.json` manually

## Attack paths analyzed

| # | Attack | Feasibility | Pre-ship status |
|---|---|---|---|
| 1 | **Bash → Codex CLI bypass** (`codex exec`, `npx codex`, `codex-on-claude threads resume`) | High | ✅ **Mitigated (F2)** |
| 2 | **Underscore / future MCP tool matcher miss** (`mcp__codex__codex_reply`, future variants) | High | ✅ **Mitigated (F1)** |
| 3 | **Fail-open state read** (corrupt config.json, symlink, malformed payload) | High | ✅ **Mitigated (F3)** |
| 4 | Legacy PreToolUse decision shape (newer Claude Code may require `hookSpecificOutput`) | Medium | ✅ **Mitigated (H1)** — dual-shape emission |
| 5 | Toggle / in-flight race (in-flight Codex call when toggling to none) | Medium | ✅ **Mitigated (H2)** — `--enforce-mode=none` baked into hook command + atomic writes |

**Final pre-ship A-series follow-up (5th Codex audit pass)**: a final review caught 4 more issues. All applied pre-ship:
- **A1**: `cmdUninstall` orphan-agent fix — `installed.agents[]` array iteration (was only legacy `installed.agent`). The fallback reviewer (`codex-reviewer-fallback.md`) is no longer left behind in `~/.claude/agents/` after uninstall. Also: when state is missing, best-effort cleanup against manifest-known targets instead of silent skip.
- **A2**: Auto-mode helpers (`detect-signals.mjs` + `auto-probe.mjs`) are now copied to `~/.claude/codex-on-claude/install/` during `applyInstallation`. SKILL.md auto-mode preamble references this path; without the copy, auto mode would be doc-on-arrival broken.
- **A3**: Atomic-write rollback — `writeJson` / `writeSettings` / `threads.writeJson` now clean up `*.tmp-PID-TS` artifacts when `fs.rename` fails (cross-FS, permission denied). Previously these would leak in user directories.

**Pre-ship audit follow-up (B-series)**: a second Codex review pass identified 3 additional code-level ship blockers + 4 high-priority refinements. All applied pre-ship:
- **B3**: `cmdGate` no longer `exit(2)` on hard-deny (could truncate stdout JSON, violate Claude Code's exit-0-with-JSON contract). Now writes stderr backstop FIRST, then JSON, exits 0 naturally.
- **B4**: Bash gate now catches shell-wrapper bypasses — `eval "codex exec ..."`, `sh -c '...'`, `bash -lc '...'`, `env codex ...`, backtick subshells. Original B-series Bash matcher missed these.
- **B5**: `uninstall` ALWAYS reconciles actual `~/.claude/settings.json` against our markers (was: state-gated; could leave orphan `--enforce-mode=none` hooks behind).
- **H1**: Bash matcher precision — `grep codex README.md`, `echo "var codex = 1"`, `find . -name "*codex*"` no longer mis-classified as Codex invocation. `codex` must be a command position (BOL / `;` / `&&` / `||` / `|` / `\`` / `(` / `$(`).
- **H2**: `readSettings()` throws on malformed JSON instead of silently returning `{}` (which would clobber the user's settings on next write). Callers back up to `settings.json.corrupt-<timestamp>` and surface a stderr warning.
- **H3**: Adversarial detection sharpened — "Find naming issues" / "Find open issues in GitHub" no longer trigger R1 (require a strong defect token like `security|bug|defect|race|injection|vulnerability|contradictions|adversarial`).
- **H4**: `mergeClassification(tier1, classification, mode)` — Tier 2 path now respects mode-aware routing for chain-strict (max → R4, others → R6), matching Tier 1 (`applyDecisionTree`) behavior.

### Attack #1 — Bash → Codex CLI bypass (MITIGATED)

**Original vector**: prompt the assistant to run `Bash` with command `codex exec --json "..."` directly. Original gate registered only MCP matchers, so `Bash` invocations never reached `decideGate`.

**Why it worked**: `install/hooks.mjs:installGate` originally registered only `mcp__codex__codex` + `mcp__codex__codex-reply` matchers.

**Fix applied** (F2):
- `installGate` now also registers a `Bash` matcher pointing to the same `gate --from-stdin` command.
- `decideGate` inspects `payload.tool_input.command` when `tool_name === "Bash"` and matches against a permissive regex covering `codex exec`, `npx codex`, `codex-on-claude threads resume`, and path-qualified variants (`/usr/local/bin/codex`).
- Word-boundary anchoring prevents false-positives on identifiers like `codexcli`.

**Verification** (`install/fixtures/v05/unit/decide-gate-extended.test.mjs`):
- `Bash + "codex exec ..."` × mode=none → deny ✅
- `Bash + "codex-on-claude threads resume <id>"` × mode=none → deny ✅
- `Bash + "npx @openai/codex doctor"` × mode=none → deny ✅
- `Bash + "ls codex-on-claude/"` × mode=none → allow ✅ (benign)
- `Bash + "echo 'var codexcli = 1'"` × mode=none → allow ✅ (identifier, no real codex invocation)
- `Bash + piped "echo prompt | codex exec ..."` × mode=none → deny ✅
- `Bash + path-qualified "/usr/local/bin/codex exec ..."` × mode=none → deny ✅

### Attack #2 — Underscore / future MCP matcher miss (MITIGATED)

**Original vector**: invoke `mcp__codex__codex_reply` or any future MCP tool name (e.g. `mcp__codex__codex_resume`).

**Why it worked**: `installGate` registered exact strings; Claude Code only routes hook payloads to our gate for matching tool names. Future tool variants would never reach the gate.

**Fix applied** (F1):
- `installGate` now registers a single wildcard matcher `mcp__codex__.*` (regex).
- `decideGate` widened from `^mcp__codex__codex` to `^mcp__codex__` (covers all current + future variants).
- `decideGate` lowercases the tool name before matching → `MCP__CODEX__CODEX` cannot slip through via case.

**Verification**:
- `mcp__codex__codex_resume` (hypothetical future) × none → deny ✅
- `mcp__codex__totally_new_thing` × none → deny ✅
- `MCP__CODEX__CODEX` × none → deny ✅
- `mcp__other__do_thing` × none → allow ✅ (gate scope preserved)

### Attack #3 — Fail-open state read (MITIGATED)

**Original vector**: symlink or truncate `~/.claude/codex-on-claude/config.json` to invalid JSON, then trigger any Codex call.

**Why it worked**: `cmdGate` caught JSON parse errors and silently treated them as `config = null`, which `decideGate` interpreted as `mode = 'synergy'` (allow).

**Fix applied** (F3):
- `cmdGate` now pre-screens the raw stdin payload for Codex-shaped patterns BEFORE parsing.
- If payload is malformed JSON AND looks Codex-shaped → deny with reason "payload is malformed JSON and tool appears codex-shaped — failing closed".
- If payload parses but config is unreadable AND tool is Codex-shaped → deny with reason "config.json unreadable, failing closed for codex-shaped tool".
- Non-Codex tools still fail-open (avoid breaking unrelated calls).

**Verification** (`install/fixtures/v05/integration/cmd-gate-fail-closed.test.mjs`):
- Codex MCP payload + missing config → deny ✅
- Codex MCP payload + corrupt JSON config → deny ✅
- Malformed stdin (truncated JSON, but Codex-shaped) → deny ✅
- Non-Codex tool + malformed stdin → silent allow ✅ (legacy behavior preserved)
- Bash codex-CLI bypass + mode=none → deny ✅

### Attack #4 — Legacy PreToolUse decision shape (MITIGATED — H1)

**Vector**: invoke Codex on a Claude Code build that no longer respects the legacy `{decision: "deny"}` PreToolUse output shape (newer spec uses `hookSpecificOutput.permissionDecision`).

**Risk assessment**: We previously emitted only the legacy shape. If Claude Code drops legacy support, the gate would silently fail open.

**Fix applied (H1)**: `cmdGate` now emits BOTH shapes in a single JSON document — legacy `{decision: "deny", reason}` + new `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason}}`. The host honors whichever it understands. Hard-deny additionally writes a backstop line to stderr (`[codex-on-claude gate] DENY: ...`) so even hosts that ignore stdout see the intent.

**B3 follow-up**: original H1 implementation called `process.exit(2)` after writing JSON, which could (a) truncate stdout under non-TTY buffering and (b) violate Claude Code's exit-0-with-JSON contract. B3 reorders: stderr backstop FIRST (synchronous), then stdout JSON write, then natural exit-0 — JSON is never truncated.

**Verification** (`install/fixtures/v05/integration/hook-shape-dual.test.mjs`, 6 cases): dual-shape JSON present + status 0 + stderr backstop fires.

### Attack #5 — Toggle / in-flight race (MITIGATED — H2)

**Vector**: kick off a long-running Codex call, then immediately `reconfigure --usage-mode=none --yes`. Or fire repeated calls during the reconfigure window.

**Risk assessment**: `installGate` writes to `~/.claude/settings.json` and `saveState` writes to `config.json` in sequence. Between the two writes there's a short window where the gate is wired but state still reads synergy.

**Fix applied (H2)**: the hook command now bakes the enforcement mode into the command line at install time — `codex-on-claude gate --from-stdin --enforce-mode=none`. `cmdGate` trusts the `--enforce-mode` flag over `config.json` when present, so the deny decision is independent of any separate state read. Atomic config writes (`temp+rename` for `config.json`, `settings.json`, and thread catalog) ensure no torn reads either.

**Residual limitation (documented)**: in-flight Codex calls that already cleared PreToolUse before the toggle are not retroactively cancelled — this is a Claude Code hook system limitation, not a codex-on-claude bug. Users wanting hard guarantees should restart Claude Code after reconfigure.

**Verification** (`install/fixtures/v05/installer-flow/15-gate-state-reconcile.sh`): gate command contains `--enforce-mode=none` after install; cleanup on mode switch works.

## Recommended pre-ship code changes (ALL APPLIED)

1. ✅ Replace exact MCP matchers with `mcp__codex__.*` in `installGate`; widen `decideGate` regex (F1)
2. ✅ Add Bash PreToolUse matcher + command inspection in `decideGate` (F2)
3. ✅ Fail-CLOSED in `cmdGate` on state-read or stdin-parse errors when tool is Codex-shaped (F3)
4. ✅ Emit dual decision shape; stderr backstop on hard-deny (H1 + B3 refinement)
5. ✅ Bake enforcement mode into hook command line for race-free toggle; atomic state writes (H2)
6. ✅ Bash gate catches shell-wrapper bypasses — `eval`/`sh -c`/`bash -lc`/`env`/`exec`/subshells (B4)
7. ✅ Bash gate precision — `codex` must be at command position, not in arg/identifier (H1 refinement)
8. ✅ Uninstall always reconciles actual `settings.json` against our markers (B5)
9. ✅ `readSettings()` throws on malformed JSON; callers back up before overwrite (H2)
10. ✅ Adversarial detection requires STRONG defect tokens (H3)
11. ✅ `mergeClassification(_, _, mode)` — Tier 2 chain-strict respects max → R4 (H4)

## Summary (final — post pre-ship audit)

| Severity | Pre-ship | Post-ship |
|---|---|---|
| Critical (High feasibility) | 0 | 0 |
| Medium | 0 | 0 (#4 + #5 both implemented as H1 + H2) |
| Low | 0 | 0 |

**Security verdict**: `usageMode=none` mode is **ship-ready** for v0.5.0. All 5 attack paths in this review (3 High + 2 Medium) are mitigated with code-level fixes (F1, F2, F3, H1, H2) PLUS 6 additional pre-ship audit refinements (B3, B4, B5, H1-Bash-precision, H2-readSettings, H3, H4). Test coverage: 144 automated cases (`install/fixtures/v05/`) including 28 dedicated shell-wrapper bypass tests, 6 dual-shape JSON tests, and 6 ruleUsageModeDrift edge cases.

**Residual risk (Known Limitation, not a bypass)**: In-flight Codex calls that already cleared PreToolUse before a mode toggle to `none` are not retroactively cancelled — this is a Claude Code hook system limitation, not a codex-on-claude defect. Restart Claude Code for hard guarantees during a sensitive mode change.
