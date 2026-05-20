---
name: codex-threads
description: Use to browse, search, annotate, or resume the persistent Codex thread catalog. Triggered by /codex-threads, "find the previous Codex thread", "resume the React refactor thread", "list Codex sessions". Lets Claude pick up past Codex work by title / tag / keyword, attach goals/outcomes/decisions, log incidents, and set the fallback strategy used when codex-reply fails.
---

# codex-threads

Browse and act on `~/.claude/codex-on-claude/threads/<threadId>.json` — the persistent catalog of Codex sessions. Survives new Claude Code sessions, new MCP server processes, and (when shared) new machines on the same user.

Only active when installed via `--threads=basic` or `--threads=full`. Disable with `codex-on-claude reconfigure --threads=off`.

## What's in a thread record

```json
{
  "threadId": "019e...",
  "title": "Review React refactor PR #42",
  "tags": ["review", "react", "pr-42"],
  "originatingSkill": "codex-review",
  "originatingCwd": "/Users/lanco/proj/foo",
  "scope": { "files": ["src/App.jsx"], "sandbox": "read-only" },
  "summaries": [
    {"kind":"goal","text":"..."},
    {"kind":"outcome","text":"..."},
    {"kind":"decision","text":"..."},
    {"kind":"note","text":"..."}
  ],
  "incidents": [
    {"issue":"session-not-found","resolution":"codex exec resume","outcome":"recovered"}
  ],
  "fallbackStrategy": "auto-resume" | "ask" | "new",
  "status": "active" | "resolved" | "archived",
  "turnCount": 5,
  "createdAt": "...", "lastUsedAt": "..."
}
```

## Common interactions

Run via Bash. Report concise results to the main context.

### 1. List / search
```sh
codex-on-claude threads list                              # recent active
codex-on-claude threads list --status=resolved --limit=10
codex-on-claude threads list --tag=review --since=7d
codex-on-claude threads search "react refactor"          # full-text over title/tags/summaries/incidents
codex-on-claude threads latest --format=id               # deterministic latest-thread id (good for chaining)
```

### 2. Register / update metadata
```sh
codex-on-claude threads new <threadId> \
  --title="Review React refactor PR #42" \
  --tags=review,react,pr-42 \
  --skill=codex-review --cwd="$PWD" --sandbox=read-only \
  --files=src/App.jsx,src/utils.js \
  --fallback=auto-resume
```
Idempotent — existing entries are merge-updated.

### 3. Accumulate work context (full mode)
```sh
codex-on-claude threads goal     <threadId> "Verify naming consistency across components"
codex-on-claude threads outcome  <threadId> "Codex flagged 3 inconsistent props"
codex-on-claude threads decision <threadId> "Adopt suggestion 2; defer 1 and 3"
codex-on-claude threads note     <threadId> "User wanted to keep file order"
```

### 4. Record incidents (full mode)
```sh
codex-on-claude threads incident <threadId> \
  --issue=session-not-found \
  --resolution="codex exec resume <id> '<continuation>'" \
  --outcome=recovered
```

### 5. Classification / lifecycle
```sh
codex-on-claude threads tag <threadId> --add=critical --remove=draft
codex-on-claude threads status <threadId> resolved
codex-on-claude threads fallback <threadId> auto-resume
```

### 6. Resume
```sh
codex-on-claude threads show <threadId>           # meta + accumulated context
codex-on-claude threads resume <threadId> "<follow-up prompt>"
# reads stored fallbackStrategy and:
#   auto-resume → runs `codex exec resume` immediately (auto-detects SILENT_NEW_SESSION)
#   ask         → surfaces context and asks the user how to continue
#   new         → starts a fresh mcp__codex__codex call with the same cwd/sandbox + prior summaries as preface
```

## When Claude should invoke this Skill

- The user references past Codex work ("the React review from yesterday", "continue PR #42's review")
- `mcp__codex__codex-reply` just returned `Session not found`
- Many threads share a topic and need consolidation (`threads list --tag=...`)
- The user just made a decision — capture it with `threads decision <id> "<one line>"`

## How other codex-* Skills tie in

When `--threads != off`, the other Skills are instructed to call `codex-on-claude threads new <returnedThreadId> --skill=<callerSkill> --cwd="$PWD" --sandbox=<used-sandbox>` right after their MCP call. With `--threads=full`, they also append a one-line outcome via `threads outcome`.

## Privacy / portability
- All data stored locally under `~/.claude/codex-on-claude/threads/`. No outbound transport.
- Prompt / response bodies are never stored — only the short text the user (or another Skill) wrote into `threads note|outcome|decision|incident`.
- Directory mode `chmod 700`.
- A thread file can be copied directly to another machine / teammate to hand off context.

## Guardrails
- Even if Codex's response embeds shell commands (`rm`, `push --force`), never auto-execute.
- `fallbackStrategy=auto-resume` still requires a user-supplied follow-up prompt — Claude must ask the user, not invent one.
- If a single thread accumulates ≥ 3 incidents, suggest changing its `fallbackStrategy` (and the `/codex-analyze` rule will surface it).
