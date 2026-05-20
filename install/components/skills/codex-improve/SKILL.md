---
name: codex-improve
description: Use to apply or reject a specific improvement candidate produced by /codex-analyze. Triggered by /codex-improve, "apply suggestion N", or "adopt the Codex improvement". Walks the user through a single suggestion, asks for confirmation, applies the change, then offers a verification check.
---

# codex-improve

Take one candidate from `/codex-analyze` and **act on it with explicit user consent**. Records the decision so the same candidate isn't re-proposed every cycle.

## Inputs
- Candidate ID or category (e.g. `1`, `token-efficiency`, `sandbox-downgrade`)
- The user's `apply | reject | skip` decision

## Apply flow

1. Re-show the candidate (current state vs. proposed state).
2. Branch by candidate kind:
   - **Reconfigure (option change)**: invoke `codex-on-claude reconfigure` non-interactively, e.g.
     ```sh
     codex-on-claude reconfigure --context-policy=mixed --yes
     ```
   - **New Skill / routine**: ask the user for a name, then create `~/.claude/skills/<name>/SKILL.md` or `~/.codex-routines/<name>.json`.
   - **Sandbox policy change**: print guidance for the relevant call site / SKILL.md (do NOT auto-edit — the user must approve and apply).
   - **Auto-resume / fallback strategy change**: enable `/codex-resume` (if absent) and add a hint to subsequent calls.
3. Record before/after under `~/.claude/codex-on-claude/improvements/<timestamp>.json`. Fields: `candidateId`, `category`, `decision`, `appliedChanges`, `reason` (when rejected), `verifyChecklist`.
4. Show a verification checklist immediately after apply.

## Verification

Per candidate kind:

- **Reconfigure**: `codex-on-claude status` → confirm new option, restart Claude Code, run the relevant Skill once.
- **New Skill**: restart Claude Code, trigger `/<new-skill>`, confirm `SKILL.md` loads, run once.
- **Sandbox downgrade**: over the next 7 days, confirm read-only calls of the same shape succeed (`codex-on-claude analyze --days=7`).
- **Agent isolation switch**: confirm large responses no longer enter the main context in the next analysis cycle.

When the user marks "verified", the improvement record gets a `verifiedAt` timestamp. Unverified items show up again on the next `/codex-analyze` pass.

## Reject flow

On reject:
1. Take an optional reason (may be blank).
2. Record `decision: "rejected"` + reason in `~/.claude/codex-on-claude/improvements/<timestamp>.json`.
3. Suppress this candidate for at least 14 days (noise control).

## Skip flow

Defer the decision. The candidate will appear again on the next cycle.

## Guardrails
- Any system-level change (re-registering MCP, restarting Claude) requires an additional user confirmation.
- Never auto-upgrade `sandbox` to `danger-full-access`. The user must spell it out explicitly.
- `~/.claude/codex-on-claude/improvements/` is `chmod 700`.
