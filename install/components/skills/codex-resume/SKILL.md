---
name: codex-resume
description: Use when an existing Codex threadId can no longer be reached via mcp__codex__codex-reply (server restarted, "Session not found for thread_id"), or when the user wants to resume a long-lived Codex session from a fresh terminal. Triggered by /codex-resume or phrases like "resume codex thread", "continue the previous Codex session". Always checks for SILENT_NEW_SESSION before claiming success.
---

# codex-resume

Use when `mcp__codex__codex-reply` returns `Session not found for thread_id`, or in a brand-new Claude Code session that only knows the `threadId` of a prior task. Recovers state via `codex exec resume`, which reads the on-disk Codex transcript.

## When to use
- `codex-reply` response contains `Session not found for thread_id: <id>`
- You're in a fresh terminal / Claude session and only have a saved `threadId`
- The MCP server process was restarted between calls and you want to continue

## How to invoke

**Preferred** — use the wrapper, which performs SILENT_NEW_SESSION detection automatically:

```sh
codex-on-claude threads resume <threadId> "<follow-up prompt>"
```

**Fallback / implementation detail** — bare `codex exec` if the wrapper is unavailable. You then have to do the mismatch check yourself:

```sh
codex exec resume --skip-git-repo-check --json <threadId> "<follow-up prompt>"
```

With `--json`, results stream as JSONL events. The final message looks like:

```json
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"<answer>"}}
```

Extract that `text` and report it to the user.

## CRITICAL: silent new-session detection

`codex exec resume <id>` (CLI 0.131) returns a clean error for unknown, well-formed UUIDv7 ids (`exit 1`, `no rollout found for thread id...`), but malformed ids that do not parse as UUIDs still silently start a fresh thread with a new UUID. The user expects continuity but actually gets a fresh session = silent context loss. This Skill must always:

1. Read `thread_id` out of the resume response.
2. If it does not match the input `threadId`, surface this to the main context explicitly:
   ```
   ⚠ SILENT_NEW_SESSION: resume requested <input-id> but codex returned <returned-id>.
   Prior context is NOT carried over. The new threadId is registered separately as a bifurcation.
   ```
3. If `--threads != off`, log the incident automatically:
   ```sh
   codex-on-claude threads incident <inputId> \
     --issue=silent-new-session \
     --resolution="codex created new threadId <returnedId>" \
     --outcome=lost-context
   ```
4. Offer the user a choice:
   - (a) Proceed with the new thread, accepting context loss
   - (b) Stop so they can recover the original conversation manually

Note: this wrapper still defends against future Codex regressions; the detection code remains correct even though the current trigger condition is narrow.

The `codex-on-claude threads resume <id> "prompt"` subcommand performs this check automatically — prefer it over a bare `codex exec resume`.

## After a successful resume

If resume succeeded with the same `threadId`, subsequent `mcp__codex__codex-reply` calls usually work again. From the next turn `/codex-followup` is the preferred path.

## Guardrails
- Do not embed secrets (tokens, passwords) in the resume prompt.
- The `threadId` itself is a public-safe identifier and may be shown in the main context.
- If resume keeps failing for the same `threadId`, start a fresh `mcp__codex__codex` call instead of looping.

## On Codex quota / rate-limit error during resume

`codex exec resume` itself can fail with `rate_limit_exceeded` / `quota` / `429`. The original thread's model is baked into the transcript and cannot be downgraded mid-resume. If quota blocks resume, start a fresh thread with the fallback tier:

```
mcp__codex__codex(
  prompt="<context summary built from prior turns>",
  cwd=<project path>,
  sandbox="<same as prior>",
  approval-policy="<same as prior>",
  model="{{codexFallbackModel}}",
  config={ "model_reasoning_effort": "{{codexFallbackReasoning}}" }
)
```

Log the bifurcation: `codex-on-claude log --outcome=fallback --error-kind=quota --notes="resume→fresh thread on fallback tier"`.
