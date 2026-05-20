---
name: codex-analyze
description: Use to analyze the local Codex usage log and surface improvement candidates — token-efficiency tweaks, new Skill ideas, sandbox-mode mismatches, repeated prompts, failure patterns. Triggered by /codex-analyze or phrases like "Codex usage report", "token efficiency check", "analyze Codex usage".
---

# codex-analyze

Read the local JSONL usage log under `~/.claude/codex-on-claude/logs/` and surface concrete improvement candidates the user can adopt or reject.

## What it analyzes

Five dimensions:

1. **Token efficiency**
   - Mean / max response size
   - Ratio of responses that landed in the main context vs. routed through the isolated `codex-reviewer` agent
   - Large responses (≥ 5KB) that did *not* go through the agent → "next time, route these calls through codex-reviewer"
2. **Repeated patterns**
   - Same / similar prompt shape repeated N times → candidate for a new Skill or routine
   - Same `threadId` reused across many days → long-running session worth treating deliberately
3. **Sandbox fit**
   - `workspace-write` calls whose response is short and lacks edits → could be downgraded to `read-only`
   - `read-only` calls that often end with "you need to modify X" → consider introducing a fix Skill
4. **Failure / retry patterns**
   - Frequency of `session-not-found` → worth automating via `codex-resume`
   - Timeout frequency → shorter prompts or different model
5. **Time / volume distribution**
   - Hourly / daily usage shape → candidates to schedule as routines

## How to run

```sh
codex-on-claude analyze
```

Options:
- `--days=N` — most recent N days (default 14)
- `--format=text|json|markdown` (default text)
- `--with-codex` — additionally ask Codex (read-only) to look for patterns the rule-based engine missed
- `--save` — persist the report under `~/.claude/codex-on-claude/reports/<timestamp>.md`

## Output structure

```
codex-on-claude analyze (last 14 days)

Summary:
  total calls: 87 | ok 81 | failed 6
  avg response: 1.4 KB | p95: 12 KB
  via agent: 12 / 87

Improvement candidates:
  [1] Token efficiency — 5 large responses landed directly in the main context
      Recommendation: route this pattern (>5KB) through the codex-reviewer subagent
      Estimated saving: ~60KB/week of main-context tokens

  [2] New Skill candidate — "Review the diff against main" repeated 11 times
      Recommendation: bundle as a /codex-routine or a dedicated Skill

  [3] Sandbox downgrade — 4 workspace-write calls produced no actual edits
      Recommendation: switch this call shape to read-only

  ...

Take action:
  codex-on-claude suggest --apply N    # adopt candidate N (records the decision, proceeds to reconfigure)
  codex-on-claude suggest --reject N --reason "..."   # reject + reason
```

## Inside Claude Code

When this Skill fires, Claude should run the command via Bash and show the output. Then ask the user two things:

1. Which candidates they're interested in (by number)
2. For each: `apply` / `reject` / `skip`

`apply` automatically calls `/codex-improve` to step through the change.

## Reports archive

`--save` reports are kept under `~/.claude/codex-on-claude/reports/` and serve as the baseline for the next cycle — measuring whether previously-applied recommendations actually moved the needle.
