# Changelog

All notable changes to `codex-on-claude` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
