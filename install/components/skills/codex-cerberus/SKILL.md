---
name: codex-cerberus
description: Use when the user invokes /cerberus or asks for a multi-head planning consensus on a task. Spawns three independent planners (Claude-only, Codex-only, Claude+Codex synergy) and returns a deterministically merged plan via the cerberus MCP server. Read-only with respect to the working tree.
---

# codex-cerberus

Triggered by `/cerberus head "<task>"` (or just `/cerberus "<task>"` — default scope is `head`).

## Required steps (do not skip or reorder)

1. Call `mcp__cerberus__init(task=<user task>, scope="head")`. Receive `{run_id, agents, head_prompts, validation_nonces, ...}`.
2. Spawn three Agents **in parallel** (single message, three tool uses). Each `head_prompts[i]` already embeds the matching nonce — pass the prompt verbatim, do NOT alter it:
   - `Agent({subagent_type: agents[0], prompt: head_prompts[0]})`
   - `Agent({subagent_type: agents[1], prompt: head_prompts[1]})`
   - `Agent({subagent_type: agents[2], prompt: head_prompts[2]})`
3. Collect the three Agent results (each is a markdown plan string). **Do not strip the trailing `cerberus-nonce: <value>` line** — the consensus call verifies it.
4. Call `mcp__cerberus__consensus(run_id, plans=[{head:"h1",plan:r1,...},{head:"h2",plan:r2,...},{head:"h3",plan:r3,...}])`. If consensus returns a `nonce verification failed` error, one or more agents stripped/altered the nonce — re-spawn that head with the original prompt and retry.
5. Present the returned `consensus_plan` to the user **verbatim**, prefixed with the `agreement_score` and a one-line `dissent` summary if `agreement_score < 0.7`.

## Do not

- Modify the consensus_plan, summarize it further, or skip the consensus call.
- Spawn fewer than three agents (e.g. if one head looks "redundant" — the algorithm needs all three).
- Strip, alter, or replace the `cerberus-nonce: <value>` trailing line from agent outputs before calling consensus. v0.5.2 verifies these to detect fabricated plans.
- Pass `force: true` to consensus in production flow. It is reserved for test/admin bypass.
- Use this Skill for execution or verification. It is plan-only. After the user reviews the consensus_plan, they choose how to proceed (`/codex-fix`, manual implementation, `/codex-review`, etc.).

## Output format

```
**Cerberus consensus** (run: <run_id>, agreement: <score>, label: <high|moderate|low>)
[if score < 0.7] *Note: heads disagreed on {N} points — see Dissent section below.*

<consensus_plan body verbatim>
```

## Failure handling

- `mcp__cerberus__init` returns error → tell the user "Cerberus init failed: \<reason\>" and exit.
- Any Agent fails → still call `mcp__cerberus__consensus` with the remaining plans (consensus algorithm handles missing heads under case 3 / 4 of the spec).
- `cost_used_tokens > cost_cap_tokens` warning from consensus → present plan as usual but append a "(cost cap reached)" footer to the agreement line.

## Cost note

A single `/cerberus head` run spawns 3 planners in parallel. Typical cost: 20k~50k tokens total (depends on task framing length). The MCP server enforces `cost_cap_tokens` (default 50000) and reports `cost_used_tokens` after consensus.

## When NOT to use

- Trivial fixes / clear single-path tasks → use `/codex-review` or direct implementation instead.
- Execute or verify phases — Cerberus Head is plan-only.
- When you already have an agreed approach and just need to implement → `/codex-fix`.
