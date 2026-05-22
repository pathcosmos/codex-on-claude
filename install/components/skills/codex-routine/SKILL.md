---
name: codex-routine
description: Use when the user wants to run the same Codex prompt template repeatedly (daily review, CI-style check, scheduled diff scan). Triggered by /codex-routine or phrases like "schedule a regular Codex check", "templated codex job", "daily codex review". Encapsulates a reusable prompt template + cron/loop integration.
---

# codex-routine

Standardize a Codex task so the same options and prompt boilerplate are reused instead of being re-typed each time.

## Usage mode (v0.5.0)
**Current mode**: `{{usageMode}}` — {{modeBehavior}}

- `none` — Routines that invoke Codex are blocked. You can still author the template (it's just YAML) but its runs will fail at the gate.
- `synergy` / `auto` — Allowed; each run is subject to the same Quick-Ref tree as a one-shot invocation.
- `max` — Routines are activated by default; ideal for periodic adversarial reviews of main-branch diffs.

## Use cases
- Daily Codex security / quality review of `main` diff
- Per-PR automatic second opinion
- Codex check whenever a specific directory (e.g. `src/critical/`) changes
- Post-build artifact review

## How to invoke

When triggered, ask the user for the routine fields and collect:

1. Routine name (e.g. `daily-main-review`)
2. Target (diff / directory / file list / command output)
3. Cadence (manual trigger only, `/loop 15m ...`, or external cron)
4. Sandbox mode (`read-only` strongly recommended)

Then produce one of two artifacts:

### A. Manual reusable prompt

Print a Codex prompt block the user can paste/recall verbatim:

```
[codex-routine: <name>]
mcp__codex__codex(
  prompt="""<standardized prompt with the collected fields filled in>""",
  cwd=<project path>,
  sandbox="read-only",
  approval-policy="never",
  model="{{codexPrimaryModel}}",
  config={ "model_reasoning_effort": "{{codexPrimaryReasoning}}" }
)
```

On `rate_limit_exceeded` / `quota` / `429` / `usage_limit_reached`, retry once with `model="{{codexFallbackModel}}"`, `config={ "model_reasoning_effort": "{{codexFallbackReasoning}}" }`, then log with `codex-on-claude log --outcome=fallback --error-kind=quota`.

### B. Schedule via Claude Code loop / cron

If the user wants automation, point at the `/loop` or `/schedule` skills:

```
/loop 1h /codex-routine <name>
```

Or via external cron with a non-interactive Codex call:

```sh
codex exec --skip-git-repo-check -C "$PWD" -s read-only --json \
  -c 'model="{{codexPrimaryModel}}"' \
  -c 'model_reasoning_effort="{{codexPrimaryReasoning}}"' \
  "<standardized prompt>" >> ~/.codex-routines/<name>.log
```

The cron-call form does NOT have automatic fallback. If quota matters in a long-running cron, wrap the call in a shell guard that re-runs with `-c 'model="{{codexFallbackModel}}"' -c 'model_reasoning_effort="{{codexFallbackReasoning}}"'` on non-zero exit.

## Storage

Routine definitions live in `~/.codex-routines/<name>.json`:

```json
{
  "name": "daily-main-review",
  "scope": "git diff main..HEAD",
  "sandbox": "read-only",
  "promptTemplate": "Review the following diff. Return only concrete issues...",
  "createdAt": "2026-05-20"
}
```

Calling the Skill with an existing name reuses the saved definition.

## Guardrails
- Automated routines must not use `workspace-write` or `danger-full-access`.
- Inspect the response for length / sensitive content before surfacing it to the user.
- On failure, log and let the next cycle retry. Never retry in a tight loop.
