# codex-on-claude — new-session usage verification (English summary)

Short English summary of [`docs/ko/test-report-2026-05-20.md`](ko/test-report-2026-05-20.md), the original 2026-05-20 verification record.

## Goal

Verify the freshly-published `codex-on-claude@0.1.0` package by running it in an isolated HOME and a fresh `claude -p` subprocess, ensuring the entire pipeline — install → new session auto-discovery → Skill/Agent invocation → Codex MCP call → catalog/log effects — works end-to-end.

## Environment

| Item | Value |
|---|---|
| OS | macOS 25.4.0 (zsh) |
| Node.js | v22.20.0 |
| Codex CLI | 0.131.0 |
| Claude Code | 2.1.144 |
| Codex auth | chatgpt mode, `codex doctor` healthy |
| Claude auth | Claude Max |
| MCP `codex` | ✓ Connected |

## Scenarios

Each test ran via:

```sh
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk --allowedTools=... "<prompt>"
```

| ID | Scenario | Result | Cost (USD) | Key finding |
|---|---|---|---|---|
| T1 | Direct `mcp__codex__codex` call (baseline) | ✅ `NEW_SESSION_BASELINE_OK` | 0.106 | MCP transport works, threadId returned |
| T2 | Natural-language prompt → `codex-review` Skill auto-match | ✅ `T2_REVIEW_OK` | 0.028 | Claude read SKILL.md description and dispatched `mcp__codex__codex` |
| T3 | Slash command `/codex-review` explicit | ✅ `T3_SLASH_OK` (+ threadId) | 0.029 | All Skill-prescribed guardrail args (`cwd / sandbox / approval-policy`) applied |
| T4 | `codex-reply` with T1's `threadId` from a new subprocess (intentional limit) | ⚠️ `Session not found for thread_id: …` | — | Justifies the `codex-resume` Skill |
| T5 | `Task` tool with `codex-reviewer` subagent (isolation) | ✅ `T5_AGENT_OK` (summary only) | 0.066 | Subagent reached MCP, returned just the 4-line summary |

Total external spend: ~$0.328. All calls ran under `read-only`.

## System-event proof of auto-discovery

The first system event each subprocess emitted listed our installed components verbatim:

| Key | Value |
|---|---|
| `mcp_servers` | `[{"name":"codex","status":"connected"}]` |
| `tools` | includes `mcp__codex__codex`, `mcp__codex__codex-reply` |
| `agents` | `["claude", "codex-reviewer", "Explore", ...]` |
| `skills` | includes all 8 installed `codex-*` skills |
| `slash_commands` | auto-generated `codex-review`, `codex-followup`, `codex-resume`, `codex-fix`, `codex-log`, `codex-analyze`, `codex-improve`, `codex-routine` |

Confirms that installed Skills/Agent are picked up by a new Claude Code session without any manual wiring.

## Limitations the run surfaced
1. **Skill hot-load** worked even without a Claude Code restart, but the README continues to recommend a restart as a conservative default.
2. **Auto-logging was Skill-prose-only.** Each Skill instructs the LLM to write a log line; a missed instruction meant a missed log. This motivated the v0.3.1 PostToolUse hook (`improvementLoop=auto-on-skill`) which logs deterministically.
3. **threadId is not persistent across MCP server processes.** This led to the v0.2 persistent thread catalog (`threads` option) so `codex-reply` failures have a documented recovery path.
4. **Rule thresholds are constants.** Currently fine; future versions may surface them as options.

## Conclusion

The published package delivered the full install → new-session auto-discovery → Skill/Agent invocation → log → analyze cycle. The intentional T4 failure validated the design of the `codex-resume` Skill.

The detailed transcripts, raw `stream-json` excerpts, exact thread IDs, and original analysis are in the Korean source: [`docs/ko/test-report-2026-05-20.md`](ko/test-report-2026-05-20.md).
