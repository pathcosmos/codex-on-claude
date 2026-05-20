---
name: codex-followup
description: Use when continuing an existing Codex thread with a follow-up question (e.g., "ask Codex again on the same thread", "/codex-followup"). Requires a known threadId from a previous Codex call. Stays read-only by default. ALWAYS ends responses with `Thread: <id>` and bumps the catalog turn count.
---

# codex-followup

Use `mcp__codex__codex-reply` to continue the **same Codex session** with the `threadId` returned by a previous call. Most efficient option within the lifetime of a single MCP server process.

## When to use
- A `threadId` from a previous `/codex-review` or `mcp__codex__codex` call is in the main context, and you need a follow-up question that depends on that context
- "About that last answer, can you also explain X" — anything context-dependent

## How to invoke

```
tool: mcp__codex__codex-reply
arguments:
  threadId: <threadId from prior response>
  prompt: |
    <follow-up question>
```

If the `threadId` is not in the main context, ask the user to show the previous Codex response — or recover it deterministically:

```sh
codex-on-claude threads latest --format=id
```

## When `codex-reply` fails

If the response is:

```json
{ "content": "Session not found for thread_id: ...", "isError": true }
```

the MCP server process has restarted. Suggest `/codex-resume`, which goes through `codex exec resume` to recover state from disk.

## MUST do after every call

1. End the response with the exact line `Thread: <threadId>` (or `Thread: (none) — <reason>` on failure).
2. If `--threads != off`, bump the catalog turn count:
   ```sh
   codex-on-claude threads new <threadId> --skill=codex-followup --bump-turn
   ```
   For `--threads=full`, also append a one-line outcome:
   ```sh
   codex-on-claude threads outcome <threadId> "Follow-up answered: ..."
   ```
3. If `improvementLoop=manual`, also append a usage log line:
   ```sh
   codex-on-claude log --skill=codex-followup --sandbox=read-only --outcome=ok \
     --thread-id=<threadId> --prompt-chars=<len> --response-chars=<len>
   ```
   With `improvementLoop=auto-on-skill` or `periodic`, the PostToolUse hook handles the log — skip manual `log`.

## Guardrails
- Do not invoke with an empty or malformed `threadId`. Confirm with the user instead.
- The sandbox follows the prior session's setting. If a different sandbox is needed, start a fresh `mcp__codex__codex` call.
- The follow-up call inherits the **model + reasoning** that the original thread was created with — you cannot change them via `codex-reply`. If you need to switch tier (e.g. drop to fallback because of quota), start a fresh `mcp__codex__codex` call with the desired settings and a new threadId.

## On Codex quota / rate-limit error

If `mcp__codex__codex-reply` returns `rate_limit_exceeded` / `quota` / `429` / `usage_limit_reached`, the thread is unrecoverable on this tier — do NOT retry the same threadId. Instead:

1. Capture the original thread's last user-visible context (the prior `codex-on-claude threads outcome ...` line, if recorded).
2. Open a fresh `mcp__codex__codex(...)` call with the fallback tier:
   ```
     model: "{{codexFallbackModel}}"
     config: { model_reasoning_effort: "{{codexFallbackReasoning}}" }
   ```
3. Log via `codex-on-claude log --outcome=fallback --error-kind=quota`. Inform the user a new threadId was created.
