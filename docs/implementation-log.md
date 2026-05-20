# codex-on-claude — implementation log (English summary)

This is a short English summary of [`docs/ko/implementation-log-2026-05-19.md`](ko/implementation-log-2026-05-19.md), which records the original 2026-05-19 build session.

## Purpose

Capture the technical checks, configuration changes, troubleshooting, and verification that produced the first working setup for calling **Codex CLI as a sub-agent from Claude Code**.

## Conclusion (from the original record)

- Technically feasible.
- Recommended path: register `codex mcp-server` as a **user-scope MCP server** in Claude Code.
- Tools exposed in Claude Code: `mcp__codex__codex`, `mcp__codex__codex-reply`.
- One-shot calls: use `mcp__codex__codex` (or `codex exec`).
- Multi-turn continuation inside the same MCP server process: use `mcp__codex__codex-reply`.
- If the MCP server restarted and `codex-reply` can't find the session: use `codex exec resume <threadId>` as a fallback.

## Environment captured at the time

- Date: 2026-05-19 → 2026-05-20 (Asia/Seoul)
- Shell: `zsh`
- Claude Code: `2.1.144`
- Codex CLI: `codex-cli 0.131.0`
- Stored Codex auth mode: `chatgpt`
- Claude Code account: Claude Max

## Steps the log covers
1. Verified Codex and Claude binaries (`which`, `--version`, `--help`).
2. Ran `codex doctor`; first attempt inside a sandbox showed DNS / reachability failures, success outside the sandbox (13 ok · 1 idle · 0 warn · 0 fail).
3. Diagnosed and resolved a Claude Code 401 by re-running `claude auth login --claudeai`.
4. Validated `codex exec --json` for one-shot calls.
5. Verified `codex mcp-server`'s `tools/list` exposes `codex` and `codex-reply`.
6. Performed direct MCP `tools/call` to Codex (got `threadId` + content back).
7. Confirmed that within the same MCP server process, `codex-reply` carries state via `threadId`; across server restarts it returns `Session not found`, but `codex exec resume <threadId>` recovers the on-disk session.
8. Registered the MCP server with `claude mcp add --scope user codex -- codex mcp-server` and verified `claude mcp get codex` reports `Status: ✓ Connected`.
9. End-to-end test from a fresh `claude -p` subprocess: `mcp__codex__codex` returned the requested token from a Codex model call.

## Why this still matters

The findings drove every design choice that followed:

- **MCP is the transport, not a feature.** Skills/Agents/Plugins all sit on top of it.
- **Same-process threadId is fragile.** Hence `codex-resume` and (later) the persistent thread catalog.
- **Sandbox defaults to read-only.** `workspace-write` only with an explicit file allowlist; `danger-full-access` is not used in this workflow.
- **Claude and Codex don't share hidden context.** Whatever you want Codex to know, the caller has to pass explicitly.

The complete walkthrough — including commands, shell output, and the exact error messages encountered — remains available in the Korean original linked above.
