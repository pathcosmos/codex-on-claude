# codex-on-claude

> Call OpenAI **Codex CLI** as a sub-agent from inside Claude Code.
> MCP transport + curated Skills + an optional isolated review Agent + a continuous-improvement loop with optional PostToolUse hook auto-logging + a persistent thread catalog — installed by one CLI.

[![npm version](https://img.shields.io/npm/v/codex-on-claude.svg)](https://www.npmjs.com/package/codex-on-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 🇰🇷 Korean mirror: [README.ko.md](README.ko.md)

---

## TL;DR

```sh
# Prerequisites already installed: Codex CLI + Claude Code, both logged in.
codex --version && claude --version

# Canonical: install or update + reconfigure in one shot
npx --yes codex-on-claude@latest
```

The installer:

1. Runs preflight — Node 18.17+, `codex`, `claude`, `codex doctor`, `claude auth status`, and the `codex` MCP server's `Connected` status.
2. Walks you through **eight questions** with arrow-key navigation (↑/↓, Space to toggle, Enter to confirm). v0.5.0 adds question §7 (`usageMode`) — Codex invocation policy (`none / synergy / auto / max`). v0.5.1 adds question §8 (`cerberus`) — opt-in 3-head planning consensus mode (default `off`). Existing installs migrate silently (`usageMode=synergy`, `cerberus=off`).
3. Shows a final review screen with `Apply / Edit again / Cancel`.
4. Copies the selected Skills (and optional Agent / hooks / PreToolUse gate when `usageMode=none`) under `~/.claude/`.

Run the same command any time to update + reconfigure — if prior state is found, the installer prints a `vPREV → vCURR` banner and walks you through previous answers as defaults. Or use `codex-on-claude reconfigure` explicitly.

---

## Why this exists

The bare wiring (Claude Code ↔ Codex CLI via MCP) is a one-line `claude mcp add`, but day-to-day use needs more:

- A **Skill** so you don't re-type the same options every call.
- An optional **Agent** so a 30KB Codex response doesn't eat the main context.
- A **continuous-improvement loop** that watches your usage and proposes smarter defaults.
- A **persistent thread catalog** so Codex sessions you started yesterday don't vanish into a "Session not found" error.

`codex-on-claude` installs the whole layered stack, and lets you turn each layer on/off.

---

## Prerequisites

| Item | Minimum | Check |
|---|---|---|
| Node.js | 18.17 | `node --version` |
| Claude Code (`claude`) | 2.1.x | `claude --version` |
| Codex CLI (`codex`) | 0.13.x | `codex --version`, `codex doctor` |
| `codex` MCP server | `Connected` | `claude mcp get codex` |
| zsh / bash | — | the installer uses one of these |

Both CLIs must be logged in.

```sh
claude auth status --text
codex doctor --summary
claude mcp get codex          # Status: ✓ Connected
codex-on-claude doctor        # runs all of the above in one shot
```

---

## Install

### A. via npx (recommended)

```sh
npx --yes codex-on-claude@latest   # always pulls latest + auto-reconfigures if state exists
```

The `--yes` flag skips the "install package" confirmation; `@latest` cache-busts npx so you never hit a stale `_npx/<hash>/` cache. The bare form `npx codex-on-claude` also works but is more prone to corrupted-cache `ENOENT` errors (see [Troubleshooting](#troubleshooting)).

### B. global install

```sh
npm install -g codex-on-claude
codex-on-claude
```

### C. from source

```sh
git clone https://github.com/pathcosmos/codex-on-claude.git
cd codex-on-claude
node install/install.mjs
```

### D. non-interactive (CI / scripted)

```sh
codex-on-claude \
  --patterns=review,followup,fix,routine \
  --context-policy=mixed \
  --improvement-loop=manual \
  --threads=basic \
  --usage-mode=synergy \
  --auto-tier2-llm-probe=on \
  --subscription-claude=max --subscription-codex=pro \
  --codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh \
  --reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh \
  --yes
```

The `--subscription-*` flags declare what you actually have access to. The `--*-model-primary` / `--*-reasoning-primary` flags pick the model + effort level you want to run by default. **Fallback is auto-locked** to each tier's base — if you exhaust quota on the primary, Skill prose retries once on the fallback (gpt-5/medium for Codex, sonnet/medium for the Claude reviewer agent at default tiers). Pass `--codex-model-fallback=...` etc. if you really need to override the lock; the installer warns and re-snaps to base.

`--share-scope=...` is accepted but **deprecated since v0.3 and ignored** (a one-line notice prints). The plugin-bundle workflow was removed in 0.3.0; if you need team distribution, share this GitHub repo and have everyone run the installer.

---

## Updating codex-on-claude

- **npx users** — one command does both. `npx --yes codex-on-claude@latest` fetches the newest release **and** auto-runs reconfigure when prior state is found (you'll see a `vPREV → vCURR` banner). No need to chain a separate `reconfigure` call.
- **Global install** — bump via npm, then re-run:
  ```sh
  npm install -g codex-on-claude@latest    # `npm update -g` also works
  hash -r                                  # zsh/bash: refresh the command hash so the new binary is picked up
  codex-on-claude                          # auto-reconfigures because prior state is detected
  ```
  If `codex-on-claude` still says "command not found" after `npm update -g`, that's a stale shell hash (see [Troubleshooting](#troubleshooting)).
- **Re-run reconfigure after updating.** Whether via npx or global, your previous answers come pre-selected, you can change any of the four options via arrow keys, and the final review screen shows exactly what's about to be saved.
- **Roll back a release** if needed:
  ```sh
  npm install -g codex-on-claude@0.3.1
  codex-on-claude reconfigure
  ```
  State files are forward/backward-compatible across patch releases; alias migrations (e.g. `on-demand → manual`) are one-way, and an older binary will just ignore unknown keys.
- **What gets touched by `npm update` itself?** Only the CLI binary. Files under `~/.claude/skills/codex-*`, `~/.claude/agents/codex-reviewer.md`, `~/.claude/settings.json` (hook entries), and `~/.claude/codex-on-claude/` are modified **only** when you run `reconfigure`, `uninstall`, or another explicit subcommand.
- Deprecated versions on npm carry a one-line `Use codex-on-claude@^X.Y.Z` pointer that `npm install` will surface.

---

## The install questions

Each answer is also a CLI flag for non-interactive use. Reconfigure later with `codex-on-claude reconfigure` — your previous answers come back pre-selected.

> v0.4.1 raises the count from 4 to 6 (subscription + primary model / reasoning per side). All new questions live below the original four; the originals still work the same way.
>
> **v0.5.0** adds question §7 (`usageMode`) — Codex invocation policy. Existing installs migrate silently to `synergy` (no prompt); explicit `reconfigure` surfaces the new question.

### 1. patterns (multi-select)

| Choice | Skills installed |
|---|---|
| One-shot read-only review | `codex-review` |
| Long multi-turn session | `codex-followup`, `codex-resume` |
| Workspace-write delegation | `codex-fix` (with strict file allowlist guardrails) |
| Templated repeating job | `codex-routine` |

Flag: `--patterns=review,followup,fix,routine`

### 2. contextPolicy (single)

| Choice | Effect |
|---|---|
| `direct` | Skills only — Codex responses land in the main context |
| `summarize` | Adds `codex-reviewer` subagent; Skills route via the agent so only the summary reaches main |
| `mixed` (recommended) | Both — Skills decide per call |

Flag: `--context-policy=direct|summarize|mixed`

### 3. improvementLoop (single)

| Choice | Behavior |
|---|---|
| `off` | No `codex-analyze` / `codex-improve` / `codex-log` Skills, no hooks |
| `manual` (default) | Skill prose triggers `codex-on-claude log`; no OS hook (was: `on-demand`, kept as alias) |
| `auto-on-skill` | Adds two PostToolUse hooks in `~/.claude/settings.json` so every `mcp__codex__codex` / `codex-reply` call is auto-logged — no Skill-prose dependence |
| `periodic` | `auto-on-skill` plus cron/loop-friendly periodic analysis guidance |

Flag: `--improvement-loop=off|manual|auto-on-skill|periodic` (alias: `on-demand → manual`)

Logging is **metadata only** — prompt / response bodies are never written to disk. The hooks we install carry a `_coc.marker = "codex-on-claude:auto-log"` sentinel so `uninstall` / `reconfigure --improvement-loop=manual` remove only the entries we added (hook-level filter as of 0.3.4 — user hooks that happen to coexist in the same group are preserved).

**Runtime config drift (v0.3.4+)**: if you manually edit `~/.claude/codex-on-claude/config.json` to set `improvementLoop` to `off` or `manual` without re-running `reconfigure`, the installed hook now respects the new value on the next call (no more silent telemetry from a stale hook). Corrupt or missing config fail-opens so existing installs don't break unexpectedly.

**Hook payload extraction (v0.3.4+)**: `threadId` is now correctly extracted from Claude Code 2.1.x's PostToolUse payload (where `tool_response` is a JSON-encoded string), and `elapsedMs` is populated from `duration_ms`. Previously every auto-hook log entry had `threadId: null`, which silently broke analyzer rules that join logs to threads.

### 4. threads (single, v0.2+)

Persistent thread catalog at `~/.claude/codex-on-claude/threads/<threadId>.json`.

| Choice | Captured per thread |
|---|---|
| `off` | nothing |
| `basic` (default when improvement loop is on) | threadId + title + tags + originatingSkill + lastUsed + turnCount |
| `full` | above plus `goal / outcome / decision / note` summaries, `incidents` (issue/resolution/outcome), and `fallbackStrategy` (`auto-resume / ask / new`) |

Flag: `--threads=off|basic|full`

External transport: **none**. Bodies of prompts / responses are never stored — only short text you (or a Skill) explicitly write via `threads outcome | decision | note | incident`.

### 5. subscription tiers (v0.4.1)

You declare which Claude + Codex subscription tier you actually have. The installer uses this **only** to constrain the model + reasoning choices in questions 6 below — it never sends anything to Anthropic/OpenAI to verify.

| Side | Tiers offered (highest → lowest) | Default |
|---|---|---|
| Claude | `enterprise / team / max / pro / free` | `max` |
| Codex  | `team / pro / plus / free`             | `pro` |

Flags: `--subscription-claude=...` and `--subscription-codex=...`

A declared tier that doesn't match reality is fine — but expect the **frequent-fallback analyzer rule** to fire as your primary tier exhausts quota repeatedly. Reconfigure to a lower tier (and lower primary reasoning) when that happens.

### 6. model / reasoning — primary + fallback (v0.4.1)

For each side (Codex calls, Claude reviewer subagent) you pick:
- **Primary**: the model + reasoning effort you want by default
- **Fallback**: **locked** to the subscription tier's base — used automatically when Skill prose detects a `rate_limit_exceeded` / `quota` / `429` / `usage_limit_reached` error

| Side | Primary flags |
|---|---|
| Codex | `--codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh` |
| Reviewer (Claude subagent) | `--reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh` |

Reasoning vocabulary (shared by Claude `--effort` and Codex `model_reasoning_effort`): `low / medium / high / xhigh / max`.

How fallback fires:
- **Codex side**: each `mcp__codex__codex` call's Skill prose ends with a "if you see rate_limit/quota, retry **once** with the locked fallback" block.
- **Reviewer subagent route**: the primary `codex-reviewer` agent emits the sentinel line `CODEX_QUOTA_FALLBACK_NEEDED`; `/codex-review` Skill prose re-launches via `codex-reviewer-fallback`.
- **`claude -p` direct callers** (cron / bench): pass `--fallback-model <id>` — Claude's CLI handles it natively without prose. Note: `--effort` only applies to primary; Claude doesn't have a `--fallback-effort` flag.

You can pass `--codex-model-fallback=...` etc. but values that don't match the matrix base are ignored with a warning — the lock is intentional. To "unlock" the fallback, raise your subscription tier (which raises the base).

Fallback events accrue in the usage log (`outcome=fallback`, `errorKind=quota|rate_limit|...`). `codex-on-claude analyze` surfaces a `ruleFrequentFallback` candidate at ≥5 events in the window — your hint to upgrade or de-tune the primary.

### 7. usage-mode — Codex invocation policy (v0.5.0)

How aggressively Claude consults Codex. Pick one of four:

| Mode | One-line definition | Default? | Behavior summary |
|---|---|---|---|
| `none` | Codex calls blocked at PreToolUse gate | — | α-only. Privacy / cost-sensitive use. The PreToolUse hook denies `mcp__codex__codex` with a structured reason. |
| `synergy` | Follow v9 guidance (Quick-Ref 3-Q tree + R1–R6 recipes) | **default for new installs + silent migration default** | 90% sweet spot. Codex fires only when matched recipes apply (adversarial review, sweet-spot partial-fail, hard reasoning). |
| `auto` | Heuristic signal detection + optional Tier 2 LLM probe | for power users | Tier 1: heuristic regex over prompt. Tier 2 (`--auto-tier2-llm-probe=on`): $0.01–0.02 Codex meta-classifier on ambiguous tasks. |
| `max` | Quality-first bounded automation | for critical tasks | R1 default ON; R5 always probe; γ hot-swap auto on P5 catastrophe. **Hard DO-NOT rules still enforced** — max ≠ override. |

Flags: `--usage-mode=none|synergy|auto|max` and (auto-only) `--auto-tier2-llm-probe=on|off`.

**Hard guardrails (every mode)** — surfaced as `{{guardrail*}}` placeholders in every SKILL.md:
- `chainJsonTrap`: hard-block (avoid Chain-JSON Trap, route to R6 Format-Safe Handoff)
- `subagentStrict`: hard-block (don't ask subagent for strict-JSON when adversarial output is also needed)
- `turnBurn`: 3-turn-stop (stop multi-turn followups at turn 3 unless new context arrived)
- `ceilingNoUpside`: warn-and-skip (when α is ≈100% already, β can only equal it)

Detailed spec + decision tree: [`docs/usage-mode-config.md`](docs/usage-mode-config.md). Quick decision card: [`docs/guidance-quick-ref.md`](docs/guidance-quick-ref.md). Recipe details: [`docs/synergy-playbook.md`](docs/synergy-playbook.md).

Existing installs (pre-0.5.0) migrate silently to `synergy` on the next `npx --yes codex-on-claude@latest` — no prompt, no behavior change. Run `codex-on-claude reconfigure` if you want to surface the new question.

#### v0.5.0 hardening (post-L6 review — 14 follow-up fixes)

Beyond the headline 4-mode policy, v0.5.0 ships a comprehensive set of fixes from a Codex peer review pass + adversarial security review. User-visible changes:

- **PreToolUse gate is race-free.** The hook command embeds `--enforce-mode=none` at install time so the gate decision never depends on a separate `config.json` read. Mode toggles do not race in-flight calls.
- **Gate covers Bash CLI bypasses.** `mode=none` blocks not only `mcp__codex__codex` MCP calls but also any `Bash` invocation whose command contains `codex exec`, `codex-on-claude threads resume`, `npx ...codex...`, or path-qualified codex binaries. Wildcard regex (`mcp__codex__.*`) handles current + future MCP tool variants. Case-insensitive matching.
- **Gate fails CLOSED for Codex-shaped tools on corrupt state.** When `config.json` is unreadable or the hook payload is malformed AND the tool looks Codex-shaped, the gate denies (was: fail-OPEN). Non-Codex tools still fail-open to avoid breaking unrelated calls.
- **Gate state reconciles automatically.** Every reconfigure inspects `~/.claude/settings.json` itself (not just `config.json`'s claim) and removes orphan gate entries from manual edits / stale state.
- **Hook decision JSON emitted in BOTH legacy and new shapes.** `{decision, reason}` + `hookSpecificOutput.permissionDecision` so the gate works against current Claude Code 2.1.x and any future version that drops legacy support. Hard-denies additionally `exit(2)` with stderr backstop.
- **State directories are 0700.** Logs (which may capture prompt sizes / thread IDs) + thread catalog + improvements are now restricted to user-only access. Best-effort on filesystems that ignore chmod.
- **Atomic config writes.** `config.json`, `settings.json`, and thread catalog files are written via `temp+rename`; concurrent readers (analyzer, status, gate) never see a torn JSON document.
- **CLI parsing hardening.** `--usage-mode max` (space-separated, common mistake) now errors with a hint to use `--usage-mode=max`. Use `=` to assign flag values; positional args are rejected against an explicit known-subcommand allowlist.
- **Silent-fill info line.** Upgrading users see `usageMode: silent default 'synergy' applied for upgrade` on auto-detected reconfigures (npx upgrade path). Explicit `reconfigure` still surfaces the §7 prompt.
- **`auto` mode classifier sharper.** Tier 1 heuristics now handle: chain step variants (numbered / lettered / first-then-finally / inline "Step N:"); mixed adversarial+style prompts ("find security bugs and naming issues" keeps adversarial signal); unquoted field-list syntax ("Return fields: status, risk, file, line"); "table" only with output-intent context; plural forms ("race conditions", "failing tests"); excluded "edge cases" alone from TDD signal.
- **Every log row carries `usageMode`.** `usage-*.jsonl` entries include the active mode at log time, powering the `ruleUsageModeDrift` analyzer rule.
- **`ruleUsageModeDrift` filters by `config.updatedAt`.** Logs from before the last reconfigure no longer trigger false-positive drift right after a mode switch.

Full details: [`docs/release-notes-0.5.0.md`](docs/release-notes-0.5.0.md) + [`docs/security-review-0.5.0.md`](docs/security-review-0.5.0.md).

**Final verification (post 5 Codex peer review cycles)**: **168 automated test cases** (112 unit + 37 integration + 17 installer-flow + 2 regression with 7 internal cases) all PASS. npm tarball **115 kB / 32 files** (99% reduction from initial build via explicit `files` allowlist + `.npmignore`). **28 total fixes** applied pre-ship across 5 review cycles (F1-F8 → G1-G7 → H1-H7 → B1-B6 → H1-H4 Bash precision → M1-M3 → A1-A4 — see [CHANGELOG.md](CHANGELOG.md) for the full breakdown). Run all tests yourself: `bash install/fixtures/v05/installer-flow/run-flow.sh && node install/fixtures/v05/unit/run-units.mjs && ...`.

---

## Cerberus mode (v0.5.1, opt-in)

When the planning step matters more than execution speed, enable Cerberus Head mode:

```sh
codex-on-claude reconfigure --cerberus=on --yes
# Then in a Claude Code session:
/cerberus head "<task description>"
```

What happens: codex-on-claude spawns three independent planners in parallel — `cerberus-h1-claude-only` (no Codex), `cerberus-h2-codex-only` (delegates fully to Codex CLI), `cerberus-h3-synergy` (Claude + Codex consultation) — then merges their plans via a deterministic algorithm into a single consensus plan. Cost: ~2–3× a single planner (typically 20–50k tokens total). Plan-only — implementation/verification phases are not included in this release.

Disable any time with `codex-on-claude reconfigure --cerberus=off --yes`. Spec: [`docs/cerberus-mode-spec.md`](docs/cerberus-mode-spec.md). PoC walkthrough: [`docs/cerberus-poc-2026-05-22.md`](docs/cerberus-poc-2026-05-22.md).

---

## Operational guidance (v0.5.0)

The v5–v9 analysis series in [`docs/`](docs/) captures **771 runs across 217 scenarios** (~\$100–115 in measured external cost). Key references for everyday decisions:

| Read this when | File |
|---|---|
| 30-second decision card for one task | [`docs/guidance-quick-ref.md`](docs/guidance-quick-ref.md) |
| Detailed comparison (Claude α / Codex γ / β orchestration) | [`docs/guidance-comparison.md`](docs/guidance-comparison.md) |
| Practical recipes (R1 Adversarial / R2 Self-review / R3 reasoning=high / R4 γ hot-swap / R5 cheap β trial / R6 Format-Safe Handoff) | [`docs/synergy-playbook.md`](docs/synergy-playbook.md) |
| Mode configuration spec (what every mode does, per-skill activation matrix) | [`docs/usage-mode-config.md`](docs/usage-mode-config.md) |
| Cross-domain validation results (post-v8 sweep) | [`docs/v8-validation-sweep.md`](docs/v8-validation-sweep.md) |
| Why these recommendations changed in v9 | [`docs/v9-adjustment-spec.md`](docs/v9-adjustment-spec.md) |

---

## What you get

### Skills under `~/.claude/skills/codex-*/SKILL.md`
- `codex-review` — one-shot read-only review of the current diff / files
- `codex-followup` — continue the same thread via `mcp__codex__codex-reply`
- `codex-resume` — CLI fallback when MCP session is lost (auto-detects silent-new-session)
- `codex-fix` — file edits under a strict allowlist (workspace-write)
- `codex-routine` — templated recurring job
- `codex-analyze` — analyze the usage log and surface improvement candidates *(improvementLoop ≠ off)*
- `codex-improve` — apply / reject specific candidates *(improvementLoop ≠ off)*
- `codex-log` — append usage log entries *(improvementLoop ≠ off; redundant when hooks handle it)*
- `codex-threads` — browse / annotate / resume the persistent catalog *(threads ≠ off)*

### Agent under `~/.claude/agents/codex-reviewer.md`
Isolates large Codex responses and returns only a 4-line summary to the main session. Installed when `contextPolicy ∈ {summarize, mixed}`.

### Plugin bundle
Deprecated since 0.3.0. Existing 0.2.x bundles are left in place — uninstall does **not** remove them; a one-line `Manual: rm -rf …` hint prints.

---

## Operating flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code session                                             │
│                                                                 │
│   User invokes /codex-review (or natural language match)        │
│            │                                                    │
│            ▼                                                    │
│   Skill follows its MUST procedure → mcp__codex__codex          │
│            │                                                    │
│            ▼                                                    │
│   ┌─── MCP transport (codex mcp-server) ──────────────────┐    │
│   │   → Codex model call                                   │    │
│   │   ← threadId + content                                 │    │
│   └────────────────────────────────────────────────────────┘    │
│            │                                                    │
│            ▼                                                    │
│   Response lands in main (or in codex-reviewer subagent)        │
│            │                                                    │
│            ▼                                                    │
│   Skill writes catalog entry + log line                         │
│   (improvementLoop=auto-on-skill: PostToolUse hook does logging)│
└─────────────────────────────────────────────────────────────────┘

Periodically — or on demand:

   codex-on-claude analyze
       │
       ▼
   reads logs/threads, ranks improvement candidates
       │
       ▼
   /codex-improve walks the user through Apply / Reject / Skip
       │
       ▼
   decisions persisted under ~/.claude/codex-on-claude/improvements/
```

---

## CLI reference

```
codex-on-claude               Install interactively (preflight included)
codex-on-claude reconfigure   Reconfigure (previous answers as defaults; review/edit/cancel at the end)
codex-on-claude doctor        Run preflight only (Node/codex/claude/MCP checks)
codex-on-claude status        Show install state
codex-on-claude uninstall     Remove installed components (Skills, Agent, hooks)
codex-on-claude analyze       Analyze usage log and surface improvement candidates
codex-on-claude suggest       Record an apply/reject decision for a candidate
codex-on-claude log           Append a usage log entry (use --from-stdin for hook payloads)
codex-on-claude threads ...   Persistent thread catalog (see below)
codex-on-claude help          Print help
```

Common combinations:

```sh
codex-on-claude status

codex-on-claude reconfigure --improvement-loop=auto-on-skill --yes   # turn on hook logging
codex-on-claude reconfigure --threads=full --yes                     # enable full thread context

codex-on-claude analyze --days=7 --format=markdown --save            # write a snapshot report
codex-on-claude suggest --apply=2                                    # adopt candidate #2
codex-on-claude suggest --reject=2 --reason="intentional pattern"

codex-on-claude uninstall
```

---

## `threads` subcommand reference (v0.2+)

```sh
codex-on-claude threads list [--status=active|resolved|archived] [--tag=...] [--since=7d] [--skill=...]
codex-on-claude threads latest [--format=id|json]                       # deterministic latest thread (great for shell automation)
codex-on-claude threads show <threadId>
codex-on-claude threads new  <threadId> --title="..." --tags=a,b --skill=codex-review --cwd="$PWD" --sandbox=read-only
codex-on-claude threads goal     <threadId> "Verify naming consistency"
codex-on-claude threads outcome  <threadId> "Codex flagged 3 issues"
codex-on-claude threads decision <threadId> "Adopt suggestion 2"
codex-on-claude threads note     <threadId> "arbitrary memo"
codex-on-claude threads incident <threadId> --issue=session-not-found --resolution="codex exec resume" --outcome=recovered
codex-on-claude threads tag      <threadId> --add=critical --remove=draft
codex-on-claude threads status   <threadId> resolved
codex-on-claude threads fallback <threadId> auto-resume
codex-on-claude threads search   "react refactor"
codex-on-claude threads resume   <threadId> "follow-up prompt"
codex-on-claude threads remove   <threadId>
```

`threads resume <id> "prompt"` reads the stored `fallbackStrategy`:

- `auto-resume` — calls `codex exec resume` and **automatically detects** silent-new-session (when codex returns a different `thread_id`), filing an incident on the original thread and registering the new one as a bifurcation.
- `ask` — prints the thread metadata + recent summaries so the user picks the next step.
- `new` — guides starting a fresh `mcp__codex__codex` call with the prior summaries as a preamble.

---

## Verification

### 1. Preflight + MCP
```sh
codex-on-claude doctor
```
Expected: `Node.js …`, `Codex CLI …`, `Claude Code …`, `codex doctor: ok`, `Claude auth: Login method: …`, `codex MCP server: ✓ Connected`.

### 2. End-to-end MCP call (a fresh `claude -p`)

```sh
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk \
  --allowedTools=mcp__codex__codex \
  "Use the Codex MCP tool to ask Codex: Return exactly OK. Then return Codex's exact answer."
```

### 3. Skill in a real session

Start a fresh Claude Code session and type:

```
/codex-review evaluate this README in two sentences.
```

Codex should answer; the response ends with a deterministic `Thread: <id>` line (per the Skill's MUST procedure).

### 4. Analyze cycle

```sh
codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok \
  --prompt-chars=120 --response-chars=600 --elapsed-ms=2100
codex-on-claude analyze --days=1
```

---

## Operational guidance

- **Default sandbox is `read-only`.** Switch to `workspace-write` only when files genuinely need edits (`/codex-fix` enforces an allowlist). `danger-full-access` is not used in this workflow.
- **Pass context explicitly.** Claude and Codex don't share hidden context — when you want Codex to know about a goal / file / constraint, name it in the prompt.
- **threadId discipline.** The `threadId` itself is a public-safe identifier. Within the same MCP server process, prefer `/codex-followup`; on `Session not found`, switch to `/codex-resume` or `codex-on-claude threads resume`.
- **401 from Claude.** If `claude auth status` looks fine but the model returns `401 Invalid authentication credentials`, re-run `claude auth login --claudeai --email <you>`.
- **Shrinking install.** Running `reconfigure` with fewer `--patterns` removes the unselected Skills automatically. Thread catalog data and improvement decisions are kept even when their Skills are removed.

---

## Privacy policy

- All logs / catalog / improvement decisions stay **on this machine**. No outbound network calls beyond the Codex/Claude APIs themselves.
- Log entries contain only metadata: timestamp, Skill name, sandbox mode, prompt/response **lengths**, threadId, outcome code.
- Prompt / response **bodies are never written to disk.**
- `~/.claude/codex-on-claude/` is created with restrictive permissions.
- Opt out at any time: `codex-on-claude reconfigure --improvement-loop=off` (also removes hook entries) and `codex-on-claude reconfigure --threads=off`.
- Full wipe: `codex-on-claude uninstall` or `rm -rf ~/.claude/codex-on-claude/`.

---

## Directory layout

```
codex-on-claude/
├── README.md            (this file)
├── README.ko.md         Korean mirror
├── CHANGELOG.md
├── LICENSE
├── package.json         npm metadata (bin: codex-on-claude)
├── install/
│   ├── install.mjs      main installer / reconfigurer / analyze CLI
│   ├── analyze.mjs      usage log analyzer + improvement candidate rules
│   ├── threads.mjs      persistent thread catalog CRUD
│   ├── hooks.mjs        ~/.claude/settings.json PostToolUse merger
│   ├── manifest.json    option ↔ component mapping
│   └── components/
│       ├── agents/codex-reviewer.md
│       └── skills/codex-{review,followup,resume,fix,routine,analyze,improve,log,threads}/SKILL.md
└── docs/
    ├── implementation-log.md   English summary
    ├── test-report-2026-05-20.md   English summary
    └── ko/             Korean originals (history)
```

After install (on a user machine):

```
~/.claude/
├── skills/codex-*/SKILL.md                       (per selected patterns + improvement loop + threads)
├── agents/codex-reviewer.md                      (contextPolicy ∈ {summarize, mixed})
├── settings.json                                 (PostToolUse hooks merged in when improvementLoop ∈ {auto-on-skill, periodic})
└── codex-on-claude/
    ├── config.json                               selections from last install/reconfigure
    ├── logs/usage-YYYY-MM-DD.jsonl
    ├── reports/                                  analyze --save outputs
    ├── improvements/                             apply/reject decisions
    └── threads/<threadId>.json + index.json      persistent thread catalog
```

---

## Troubleshooting

### `codex-on-claude: command not found` right after `npm update -g` / `npm install -g`

Stale shell command hash — npm replaced the binary file on disk, but your current zsh/bash session is still caching the old path. Fix:

```sh
hash -r        # zsh / bash: clear cached command lookups
# or: rehash   # zsh-specific
# or open a new terminal
codex-on-claude --version
```

`codex-on-claude doctor` (v0.3.3+) auto-detects this case and prints the same hint.

### `npx codex-on-claude` fails with `ENOENT … _npx/<hash>/package.json`

Corrupted npx per-package cache, usually from a previously interrupted run. Force a fresh download:

```sh
npx --yes codex-on-claude@latest   # `@latest` cache-busts the per-package directory
# still broken? nuke npx's cache entirely:
rm -rf ~/.npm/_npx
```

The canonical install command in this README (`npx --yes codex-on-claude@latest`) avoids this class of failure because `@latest` forces npx to revalidate the package version on every run.

### `claude mcp get codex` reports "Failed to connect"

Often just a sandboxed shell. Re-run in a normal terminal:

```sh
claude mcp get codex
claude mcp list
```

### `Session not found for thread_id`

The MCP server restarted. Fallback:

```sh
codex exec resume --skip-git-repo-check --json <threadId> "<follow-up prompt>"
```

Or, inside Claude Code: `/codex-resume`. The `codex-on-claude threads resume <id> "..."` subcommand wraps this and auto-detects the silent-new-session case (where Codex returns a different `thread_id` than requested).

### `401 Invalid authentication credentials`

Even when `claude auth status` looks healthy:

```sh
claude auth login --claudeai --email <your-email>
```

### Skill not detected in a new session

Restart Claude Code. Skills are loaded once at session start; install / reconfigure / uninstall only affect future sessions (with the rare exception of hot-load when the harness happens to refresh).

### Reconfigure removed something I wanted

Re-run with the full set:

```sh
codex-on-claude reconfigure
# step through with arrow keys, the previous answers are pre-selected
```

The final review screen lets you `Edit again` before saving.

### `codex-on-claude threads latest --format=id` includes the CLI banner / ANSI escape codes

Fixed in v0.3.4 — the top-level `codex-on-claude vX.Y.Z` banner now goes to **stderr**, so stdout for `--format=id|json` data subcommands is clean:

```sh
codex-on-claude threads latest --format=id            # stdout: bare UUID (or empty)
codex-on-claude threads latest --format=id 2>/dev/null  # silences banner entirely
```

If you're stuck on ≤ 0.3.3 and need to scrape stdout, strip ANSI + grep UUIDs:

```sh
codex-on-claude threads latest --format=id \
  | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
  | head -1
```

### Hook keeps logging after I set `improvementLoop=off` in `config.json` (without reconfigure)

Fixed in v0.3.4 — the auto-on-skill hook (`codex-on-claude log --from-stdin`) now reads `~/.claude/codex-on-claude/config.json` on each call and silently no-ops when `improvementLoop` is `off` or `manual`. No `reconfigure` step required for the gate to take effect.

If your hook command path is stale (still points at the npm-cached binary from before the fix), reinstall + reconfigure to refresh:

```sh
npm install -g codex-on-claude@latest
codex-on-claude reconfigure --yes
```

Manual `/codex-log` invocations are unaffected by the guard — explicit logging always works.

### Mixed-ownership PostToolUse group lost my user hook on uninstall (≤ 0.3.3)

Fixed in v0.3.4. If you manually nested a `_coc.marker` entry inside a group also containing your own hook, the previous code removed the whole group via `.some()` semantics. The new `stripOursFromGroups` operates at the hook level — your hooks are preserved, only marked entries are removed. The installer never produces mixed groups itself; this protects you only against manual `settings.json` edits.

---

## Contributing / license

- Issues / PRs welcome: <https://github.com/pathcosmos/codex-on-claude>
- License: MIT

---

## History

- [`CHANGELOG.md`](CHANGELOG.md) — release notes
- [`docs/implementation-log.md`](docs/implementation-log.md) — English summary of the original 2026-05-19 build session ([Korean original](docs/ko/implementation-log-2026-05-19.md))
- [`docs/test-report-2026-05-20.md`](docs/test-report-2026-05-20.md) — English summary of the 2026-05-20 verification run ([Korean original](docs/ko/test-report-2026-05-20.md))
- [`docs/test-scenarios-codex-calls.md`](docs/test-scenarios-codex-calls.md) — 0.3.3-era comprehensive test scenario document (~43 scenarios × 8 groups covering MCP transport, 9 Skills, codex-reviewer Agent, 14 threads subcommands, hooks, analyzer rules, full E2E). Each scenario has Given/Setup/Command/Expected/Notes plus deterministic fixtures at `install/fixtures/analyze-rules/`.
- [`docs/test-execution-results-2026-05-20.md`](docs/test-execution-results-2026-05-20.md) — execution log of the 0.3.4 cycle: Phase A (hooks, 10/10 PASS), Phase B (resume + SILENT_NEW_SESSION, 7/7 PASS after malformed-id correction), Codex-call ledger (27 calls across the session), bug discovery via meta-audit, synergy measurement (findings/$, findings/min, PRE/POST ratio).
