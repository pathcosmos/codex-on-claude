# Changelog

All notable changes to `codex-on-claude` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.4] — 2026-05-20

### Fixed (production bug fixes — auto-on-skill / threads / hook safety)

- **`threadId` was always `null` in PostToolUse hook log entries.** Claude Code 2.1.x sends `tool_response` to PostToolUse hooks as a **JSON-encoded string**, not a parsed object. The previous `extractFromHookPayload` (install.mjs:799-853) read `response.threadId` directly and the regex fallback couldn't match doubly-escaped quotes, so every `usage-YYYY-MM-DD.jsonl` entry produced by the `auto-on-skill` hook had `"threadId": null`. As a result, analyzer rules that join logs to threads (`ruleSessionNotFound`, `ruleIncidentRepeat`, future threadId-correlated rules) silently degraded. Fix: try `JSON.parse(response)` when `tool_response` is a string, then read `.threadId` / `.thread_id` as before. Verified end-to-end: a real PostToolUse payload now yields the correct UUIDv7 in the log.
- **`elapsedMs` was hardcoded to `0` in hook logs.** Now populated from `payload.duration_ms` (Claude Code's measured tool latency). The fallback stays `0` for synthetic payloads that lack timing.
- **Mixed-ownership hook group could erase user hooks.** `install/hooks.mjs`'s previous `isOursGroup` filter used `.some()` semantics — if a `PostToolUse` group accidentally contained BOTH a user hook and a `codex-on-claude:auto-log` marked hook, the entire group (including the user hook) was deleted on `uninstall` / `reconfigure --improvement-loop=off`. Added `stripOursFromGroups()` (hooks.mjs:50-58) which operates at the hook level — preserves user hooks even when intermixed with our markers. The installer still never produces mixed groups itself; this fix protects against manual edits to `settings.json`.
- **Hook kept logging after `improvementLoop` changed in `config.json` without `reconfigure`.** Once installed, the PostToolUse hook command path (`codex-on-claude log --from-stdin`) was unconditional — silent telemetry from the user's perspective. Added a runtime guard `shouldAcceptAutoHookLog()` (install.mjs:855-863) that the `--from-stdin` path consults before reading stdin: if `~/.claude/codex-on-claude/config.json`'s `improvementLoop` is `off` or `manual`, the hook silently no-ops. Manual `/codex-log` flow (no `--from-stdin`) is unaffected. Corrupt/missing config fail-opens so existing installs don't break unexpectedly. Verified across `off / manual / auto-on-skill / periodic / corrupt-config` — all behave correctly.

### Changed

- **CLI banner moved from stdout to stderr.** `install.mjs:1135` now uses `console.error` for the top-level `codex-on-claude vX.Y.Z` line. Stdout is now clean for data-mode subcommands such as `threads latest --format=id` and `analyze --format=json` — no more `sed 's/\x1b\[[0-9;]*m//g'` workaround in automation. Interactive humans still see the banner inline because most terminals show stderr alongside stdout. Subcommand-specific output (status data, threads list, analyze report, etc.) stays on stdout where it always was.

### Internal (docs / SKILL accuracy / test infrastructure)

- **`codex-resume/SKILL.md` SILENT-new-session trigger condition corrected.** Prior text claimed "codex CLI 0.131 silently starts a new thread if the given id is not on disk." Phase B test execution (this session) confirmed that codex CLI 0.131 actually **returns a clean error (exit 1, `no rollout found for thread id...`) for well-formed UUIDv7 unknown ids**; SILENT_NEW_SESSION fires only for **malformed** thread ids (anything that doesn't parse as a UUID). The detection code in `threads resume` is still correct — only the documented trigger condition was misstated. Also reordered "How to invoke" to lead with the `codex-on-claude threads resume` wrapper (which performs the mismatch check automatically), with bare `codex exec resume` as the fallback / implementation detail.
- **New defensive test scenario `G7-3e`** in `docs/test-scenarios-codex-calls.md` — verifies the `shouldAcceptAutoHookLog` guard end-to-end across `off` / `manual` modes. Companion to existing G7-1 (install-time loop check) so post-install config drift is also covered.
- **New fixtures** under `install/fixtures/analyze-rules/` (15 files): per-rule deterministic seed data for the 9 analyzer rules. Each fixture triggers exactly one rule, so `codex-on-claude analyze` can be regression-tested without waiting for organic usage to accumulate. See `install/fixtures/analyze-rules/README.md` for thresholds, the rule-to-fixture map, and lifecycle (commit-don't-delete) policy.
- **New test scenario doc** `docs/test-scenarios-codex-calls.md` (~64 KB, ~43 scenarios across 8 groups) covering every Codex calling surface (MCP transport, 9 Skills, codex-reviewer Agent, 14 threads subcommands, hooks, analyzer rules, full E2E). Each scenario has Given/Setup/Command/Expected/Notes plus copy-paste commands. Cost ceiling ~$0.50 on Haiku.
- **New execution-results doc** `docs/test-execution-results-2026-05-20.md` — Codex-call ledger (27 calls across this session), per-scenario log for Phase A (10/10 PASS hook scenarios) + Phase B (7/7 PASS resume + SILENT detection), error/deficiency/improvement log, synergy measurement table.

### Deployment note

The fixes above edit `install/install.mjs`, `install/hooks.mjs`, and `install/components/skills/codex-resume/SKILL.md`. Users who installed via `npm install -g codex-on-claude` will pick up the new behavior **after the next `npm install -g codex-on-claude@latest`** and a re-run of `codex-on-claude reconfigure` so the auto-on-skill hook command points at the updated binary. Existing installs whose hook command still calls the previous npm-cached path (`~/.nvm/.../lib/node_modules/codex-on-claude/install/install.mjs` or `~/.npm/_npx/<hash>/...`) will keep logging via the old code until either reinstalled or manually synced.

## [0.3.3] — 2026-05-20

### Added (UX, patch — no flag / CLI signature changes)
- **Unified `npx --yes codex-on-claude@latest`** as the canonical command. When prior install state is found, the no-arg path now flips into reconfigure mode automatically and prints a `vPREV → vCURR` banner so "update + reconfigure" is one obvious step instead of two.
- **`preflight` self-check.** `doctor` (and every install/reconfigure run) now checks whether `which codex-on-claude` resolves and whether it matches the running script's realpath. If they differ, you get a `Run \`hash -r\`` hint — catches the "command not found right after `npm update -g`" stale-shell-hash case.
- **"Next steps" stale-shell hint.** After a fresh install in zsh / bash, the installer reminds you to run `hash -r` if the new binary doesn't resolve in the current shell.

### Changed
- Help text: `codex-on-claude` (no arg) is now documented as "Install or reconfigure (auto-detects existing state)". Examples lead with `npx --yes codex-on-claude@latest`.
- `README.md` Install / Updating / Troubleshooting sections now lead with the canonical `npx --yes codex-on-claude@latest`. New troubleshooting entries for the `command not found` (stale shell hash) and `npx ENOENT ... _npx/<hash>/package.json` (corrupted npx cache) cases.

No behavioral or schema changes — only the no-arg flow's mode auto-flips when state exists, and the reconfigure flow itself is unchanged.

## [0.3.2] — 2026-05-20

### Changed (docs / i18n)
- All installer prompts, status output, deprecation warnings, alias migration lines, and section headers now in English.
- All `install/manifest.json` question and choice labels translated to English (option keys unchanged).
- All Skill / Agent prose translated to English. Code blocks, file paths, and shell snippets preserved verbatim. Stale references refreshed against the v0.3.1 surface (`auto-on-skill` hooks, `threads latest`, silent-new-session detection).
- `install/analyze.mjs` rule titles / findings / recommendations translated to English.
- `README.md` rewritten end-to-end in English and brought current to the 0.3.1 feature set (4-question flow, auto-on-skill PostToolUse hooks, `threads latest`, silent-new-session detection, arrow-key UI). New **"Updating codex-on-claude"** section explains the `npm update` / `npx@latest` / `reconfigure` / rollback / "what update touches" flow. Korean mirror at `README.ko.md`.
- Historical Korean memos moved to `docs/ko/`; new English summaries at `docs/implementation-log.md` and `docs/test-report-2026-05-20.md`.
- `package.json` `description` refreshed to reflect post-0.3.0 reality (no plugin bundle, auto-on-skill hooks, persistent threads).

### Added (UX, still patch — no flag / CLI signature changes)
- Reconfigure now opens with a **"Current selections" panel** so the user sees what was saved before any picker fires.
- Each question's picker opens with the existing answer pre-checked / highlighted (via `@inquirer/prompts` defaults).
- After each pick, a **kept / changed (a → b)** badge prints so the user knows what changed.
- A **final review screen** (both fresh install and reconfigure) lists every selection with "(was: …)" deltas and offers `Apply / Edit again / Cancel`. Choosing **Edit again** loops back with the draft selections pre-checked (so partial changes survive the loop).
- `--yes` skips the review and applies immediately. Non-TTY environments also bypass cleanly.

No behavioral or schema changes beyond the additive UX. Pure documentation / i18n / UX patch.

## [0.3.1] — 2026-05-20

### Added (backward-compatible patch)
- `improvementLoop` now supports four keys instead of three: `off | manual | auto-on-skill | periodic`. The previous `on-demand` value is accepted as an **alias for `manual`** and silently migrated in `~/.claude/codex-on-claude/config.json` on next `reconfigure` (with a one-line info log).
- New `auto-on-skill` mode installs PostToolUse hooks in `~/.claude/settings.json` so every call to `mcp__codex__codex` / `mcp__codex__codex-reply` automatically appends a usage log line — no Skill prose dependence. The hook command is `codex-on-claude log --from-stdin` and uses a marker (`_coc.marker = "codex-on-claude:auto-log"`) so uninstall removes only our own entries.
- `periodic` now implies `auto-on-skill` (hooks + suggestions cron-friendly).
- New `--from-stdin` flag on the `log` subcommand — reads Claude Code's PostToolUse JSON payload and extracts `tool_name`, `tool_input.sandbox`, `tool_response.threadId`, prompt/response lengths, and `session-not-found` signals automatically.
- `status` now prints how many PostToolUse hook groups are currently installed under our marker.

### Notes
- Patch bump (not minor) because the rename uses a transparent alias; `--improvement-loop=on-demand` keeps working, no flag/CLI signature actually changes.
- Hooks are only installed when `improvementLoop ∈ {auto-on-skill, periodic}`. The interactive flow surfaces a one-line consent reminder before applying; `uninstall` removes them; manual cleanup is `codex-on-claude reconfigure --improvement-loop=manual --yes`.
- If `~/.claude/settings.json` already has other hooks, we merge non-destructively.

## [0.3.0] — 2026-05-20

### Changed (BREAKING)
- **Removed `shareScope` install question and `--share-scope` flag.** The interactive flow is now **four** questions (patterns / contextPolicy / improvementLoop / threads). Passing `--share-scope=...` still parses but emits a deprecation warning and is ignored.
- **Plugin bundle auto-generation removed.** `~/.claude/plugins/marketplaces/codex-bridge/` is no longer created. Team distribution should clone the GitHub repo directly. Existing bundles from 0.2.x are **left in place** — `uninstall` no longer touches them; a manual `rm -rf` is required.

### Added
- Interactive install prompts now use arrow-key navigation (↑/↓) and space-to-toggle via `@inquirer/prompts`. Multi-select shows current checked state inline; single-select highlights the default.
- Non-TTY environments (pipes / CI) automatically fall back to defaults without hanging or raising.

### Dependencies
- Added `@inquirer/prompts@^8.x` as a runtime dependency. First-time install costs ~25 transitive packages but they are tiny and stay in npm cache afterwards.

### Migration (0.2.x → 0.3.0)
- No action required. The `shareScope` key in `~/.claude/codex-on-claude/config.json` is silently ignored on next `reconfigure`. If a plugin bundle directory exists from a previous install with `--share-scope=team`, `status` shows a one-line legacy hint and `reconfigure` emits a warning with the manual cleanup command.

### Versioning note
- This is a `minor` bump (rather than the project's default `patch`-only) because removing `--share-scope` is a CLI signature change. Per project policy, future releases revert to patch-only unless explicitly requested.

## [0.2.2] — 2026-05-20

### Added
- `codex-on-claude threads latest [--format=id|json]` — return the most recently-touched thread deterministically. External regression harnesses can use this instead of grepping LLM response text for `threadId`.
- `codex-on-claude doctor` now also verifies the `codex` MCP server is registered and `Connected`. README "Prerequisites" updated accordingly.
- `codex-on-claude threads resume <id> "prompt"` now detects **silent new-session** behavior of codex CLI 0.131 — if `codex exec resume` returns a different `thread_id` than requested, it surfaces `SILENT_NEW_SESSION` to stderr, records an incident on the original thread (`issue=silent-new-session, outcome=lost-context`), and registers the new thread as a bifurcation.

### Changed (docs/Skill prose only — no behavior change)
- `codex-review`, `codex-followup`, `codex-fix`, `codex-resume` SKILL.md now contain an explicit **"MUST do after every call"** section enforcing: (a) ending responses with a deterministic `Thread: <id>` line, (b) registering metadata via `codex-on-claude threads new` when threads are enabled, (c) appending a usage log via `codex-on-claude log` when the improvement loop is enabled. This addresses the "Skill prose ≠ actual LLM behavior" gap surfaced by external regression tests.
- README and `manifest.json` clarify that `improvementLoop=on-demand` does *not* install OS-level hooks — log entries appear because the Skill prose tells the LLM to write them, so any skipped Skill call silently misses a log entry. Hook-based enforcement is queued for v0.3.

### Notes
- External regression suite (`codex-on-claude-test`) verified 4 categories of behavioral gap; this release closes the deterministic surface area while preserving backward compatibility (no flag/CLI signature changes). The remaining gaps (option-key rename, PostToolUse hook auto-logging) are scheduled for v0.3.

## [0.2.1] — 2026-05-20

### Fixed
- **Critical**: removed `postinstall` script from `package.json`. The previous version embedded a `console.log` containing literal backticks around `` `npx codex-on-claude` ``, which `sh -c` interpreted as command substitution. That caused npm to re-invoke `npx codex-on-claude` during install — an infinite-recursion install loop that only terminated on `SIGINT`. Affects 0.2.0 (0.1.0 had the same script but the issue went unnoticed because of caching during initial publish).

### Removed
- `package.json` `scripts.postinstall` (the help line wasn't worth the risk; the installer prints next steps itself when run).

## [0.2.0] — 2026-05-20

### Added — Persistent thread catalog
- New install option `--threads=off|basic|full` (default `basic` when `improvementLoop != off`)
- New CRUD module `install/threads.mjs` storing each Codex thread in `~/.claude/codex-on-claude/threads/<threadId>.json` with a `index.json` rollup
- Thread record schema: `title`, `tags`, `originatingSkill`, `originatingCwd`, `scope (files/sandbox/approvalPolicy)`, `summaries (goal/outcome/decision/note)`, `incidents (issue/resolution/outcome)`, `fallbackStrategy (auto-resume|ask|new)`, `status (active|resolved|archived)`, `turnCount`
- New CLI subcommand `codex-on-claude threads` with: `list / show / new(=upsert=touch) / goal / outcome / decision / note / incident / tag / status / fallback / search / resume / remove`
- `threads resume <id> "prompt"` reads the stored `fallbackStrategy` and either runs `codex exec resume` automatically (`auto-resume`), shows context for the user to decide (`ask`), or guides starting a fresh session with prior summaries as preface (`new`)
- New Skill `codex-threads` so Claude can pick up past Codex work by title/tag/keyword
- Existing Skills (`codex-review`, `codex-followup`, `codex-resume`, `codex-fix`) extended with explicit "thread persistence" sections that show how to push metadata after each call
- Three new analyze rules: stale active threads, repeated incidents on the same thread, similar-tag clustering
- Analyze summary now includes `threads: N total / N active`

### Changed
- `codex-on-claude status` and the install summary now print the `threads` choice
- Help text updated to document the new subcommand and `--threads` flag
- `manifest.json` version field bumped to 0.2.0

### Notes
- `codex-on-claude uninstall` still removes the entire `~/.claude/codex-on-claude/` directory (including `threads/`). Back up the thread catalog before uninstalling if it matters — a future release may add `--keep-data`.
- Thread bodies (prompt/response) are still never stored. Only the metadata you (or a Skill) explicitly write via `threads outcome|decision|note|incident` is persisted.

## [0.1.0] — 2026-05-20

Initial release.

- Installable Skills: `codex-review`, `codex-followup`, `codex-resume`, `codex-fix`, `codex-routine`, plus `codex-analyze` / `codex-improve` / `codex-log` when the improvement loop is enabled
- Optional `codex-reviewer` subagent for isolated large-output reviews
- Optional Plugin bundle for team-wide deployment
- Local-only usage log (`logs/usage-YYYY-MM-DD.jsonl`) and analysis engine
- Subcommands: install (interactive), `reconfigure`, `doctor`, `status`, `uninstall`, `analyze`, `suggest`, `log`
- Automatic preflight (Node 18.17+, `codex`, `claude`, `codex doctor`, `claude auth status`)
