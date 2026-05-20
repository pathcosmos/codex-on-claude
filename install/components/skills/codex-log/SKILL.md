---
name: codex-log
description: Use after any mcp__codex__codex or mcp__codex__codex-reply call to record metadata to the local usage log. Triggered manually via /codex-log or by other codex-* Skills when improvementLoop=manual. When improvementLoop is auto-on-skill or periodic, the PostToolUse hook handles logging automatically and this Skill is redundant. Local-only, opt-in.
---

# codex-log

Append a single line of Codex-call metadata to the local JSONL log. Local-only, no external transport. Feeds `/codex-analyze` and the improvement-suggestion engine.

## When this runs
- Other `codex-*` Skills call it right after a Codex MCP invocation (when `improvementLoop=manual`)
- The user invokes `/codex-log` to add an entry manually
- **Not** needed when `improvementLoop=auto-on-skill` or `periodic` — the PostToolUse hook in `~/.claude/settings.json` calls `codex-on-claude log --from-stdin` automatically with the full payload

## Log location
- `~/.claude/codex-on-claude/logs/usage-YYYY-MM-DD.jsonl`
- One line = one call

## Log entry schema

```json
{
  "ts": "2026-05-20T12:34:56.000Z",
  "skill": "codex-review",
  "tool": "mcp__codex__codex",
  "sandbox": "read-only",
  "approvalPolicy": "never",
  "threadId": "019e...",
  "promptChars": 412,
  "responseChars": 1834,
  "elapsedMs": 4823,
  "viaAgent": false,
  "outcome": "ok",
  "errorKind": null,
  "notes": null
}
```

`outcome` is one of `ok | session-not-found | tool-error | user-cancelled | timeout`.

## How to append

Preferred (via the CLI, which handles file location and JSON shape):

```sh
codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok \
  --prompt-chars=412 --response-chars=1834 --elapsed-ms=4823 --thread-id=<id>
```

Fallback (raw append):

```sh
mkdir -p ~/.claude/codex-on-claude/logs
echo '<JSON one-liner>' >> ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl
```

## Privacy policy
- Prompt / response **bodies are never stored**. Only length and metadata.
- `threadId` is stored as an identifier (needed for Codex-side recovery).
- `notes` only contains short text the user explicitly added.
- Log directory is `chmod 700`. No outbound traffic.
- Wipe at any time: `rm -rf ~/.claude/codex-on-claude/logs/`.

## Disabling
Choose `improvementLoop=off` (during install or via `codex-on-claude reconfigure --improvement-loop=off`); the Skill is removed and no logs are written.
