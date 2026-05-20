---
name: codex-fix
description: Use when the user wants Codex to actually edit files (not just review) under a strict file-scope. Triggered by /codex-fix or phrases like "let Codex apply the fix", "have Codex patch this". Enforces workspace-write sandbox with an explicit file allowlist. ALWAYS ends responses with `Thread: <id>` and (catalog enabled) records a decision summary + edited file list.
---

# codex-fix

Delegate **file edits** to Codex. Enforces these guardrails on every call:

1. `sandbox` is `workspace-write` only. `danger-full-access` is never used.
2. The prompt always names the **allowed file paths** explicitly; Codex must not touch anything outside that list.
3. The model must return a concrete edit summary (per-file lines added/removed) so the user can review.
4. `approval-policy` defaults to `on-request` (risky commands require user consent).

## When to use
- A small, well-scoped change (refactor, simple bugfix, clear addition) where Codex applying the diff is faster than Claude editing manually
- The exact file set to touch is decided in advance

## When NOT to use
- Wide-ranging changes touching many files / many directories — keep that in Claude or split into smaller fixes
- The file scope is unclear → run `/codex-review` first to get scoped recommendations
- Anything touching secrets / auth / deployment config

## How to invoke

```
tool: mcp__codex__codex
arguments:
  prompt: |
    Edit ONLY the following files: <explicit list>.
    Do not create, rename, or delete any other file.
    Task: <concrete description>
    After editing, output a JSON summary like:
      { "edited": ["path1", "path2"], "summary": "<one line per file>" }
    If you cannot complete the task without editing files outside the allowlist,
    STOP and reply with exactly: NEEDS_OUT_OF_SCOPE_FILES followed by the list.
  cwd: <absolute project path>
  sandbox: workspace-write
  approval-policy: on-request
  model: "{{codexPrimaryModel}}"
  config: { model_reasoning_effort: "{{codexPrimaryReasoning}}" }
```

## After the call
- Show the `edited` list to the user.
- If any file outside the allowlist was modified, warn the user immediately and suggest `git diff` / `git restore` for rollback (do not auto-rollback).
- Keep the `threadId` so follow-up edits / verification can use `/codex-followup`.

## MUST do after every call

1. End the response with `Thread: <threadId>` (or `Thread: (none) — <reason>`).
2. If `--threads != off`, register catalog metadata plus a decision summary:
   ```sh
   codex-on-claude threads new <threadId> \
     --skill=codex-fix --cwd="$PWD" --sandbox=workspace-write \
     --title="Fix: <one-line>" --tags=fix --files=<allowlist>
   codex-on-claude threads decision <threadId> "Allowed files: <files>; result: <edited list OR NEEDS_OUT_OF_SCOPE_FILES>"
   ```
   For `--threads=full`, append the post-apply outcome:
   ```sh
   codex-on-claude threads outcome <threadId> "Edited N files: ..."
   ```

   If Codex replied `NEEDS_OUT_OF_SCOPE_FILES`, log an incident:
   ```sh
   codex-on-claude threads incident <threadId> \
     --issue=out-of-scope-files-needed \
     --resolution="expand allowlist after user review or split the task" \
     --outcome=blocked
   ```
3. If `improvementLoop=manual`, append a usage log line (sandbox=workspace-write):
   ```sh
   codex-on-claude log --skill=codex-fix --sandbox=workspace-write \
     --outcome=ok --thread-id=<threadId> ...
   ```
   With `auto-on-skill` / `periodic`, the PostToolUse hook handles logging.

## On Codex quota / rate-limit error (primary → fallback retry)

Same protocol as `/codex-review`: if the primary call returns `rate_limit_exceeded` / `quota` / `insufficient_quota` / HTTP `429` / `usage_limit_reached`, retry **once** with the matrix-locked fallback by replacing only:

```
  model: "{{codexFallbackModel}}"
  config: { model_reasoning_effort: "{{codexFallbackReasoning}}" }
```

Log via `codex-on-claude log --outcome=fallback --error-kind=quota`. Do NOT loop. If fallback also fails, abort the edit and notify the user — never partially commit a fix that the model couldn't complete in either tier.

## Verification

Right after install (dry-run, no actual edits):

```
mcp__codex__codex(
  prompt="List the files in CWD root and reply with FIX_SKILL_OK. Do not edit anything.",
  cwd=<project path>,
  sandbox="workspace-write",
  approval-policy="on-request",
  model="{{codexPrimaryModel}}",
  config={ "model_reasoning_effort": "{{codexPrimaryReasoning}}" }
)
```
