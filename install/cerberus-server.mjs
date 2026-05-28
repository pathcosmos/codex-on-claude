// Cerberus MCP server — exposes init/consensus/status/list/inspect tools.
// Invoked via `codex-on-claude mcp-server cerberus` (stdio transport).
// Spec: docs/cerberus-mode-spec.md (Draft 2).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import { consensus as runConsensus } from "./cerberus-consensus.mjs";
import { consensusOptsFromConfig, costCapFromConfig } from "./cerberus-config.mjs";

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, ".claude", "codex-on-claude");
const CERB_DIR = path.join(STATE_DIR, "cerberus");
const RUNS_DIR = path.join(CERB_DIR, "runs");
const INDEX_FILE = path.join(CERB_DIR, "index.json");
const CONFIG_FILE = path.join(STATE_DIR, "config.json");

// ── Utilities ──────────────────────────────────────────────────────────────

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
  try { await fs.chmod(p, 0o700); } catch { /* best-effort */ }
}

async function readJsonSafe(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
}

async function writeJsonAtomic(p, data) {
  const dir = path.dirname(p);
  await ensureDir(dir);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  try { await fs.rename(tmp, p); }
  catch (e) { await fs.rm(tmp, { force: true }).catch(() => {}); throw e; }
}

async function appendJsonl(p, entry) {
  await ensureDir(path.dirname(p));
  await fs.appendFile(p, JSON.stringify(entry) + "\n");
}

function nowIso() { return new Date().toISOString(); }

function newRunId() {
  // <ISO compacted>-<6 hex random> — sortable, collision-resistant within ms.
  const ts = nowIso().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ts}-${rand}`;
}

async function loadConfig() {
  // v0.5.5: the pre-v0.5.5 reader pointed at `cfg.choices.cerberus` (the "on"/"off" enum), so
  // the fallback-object literal was unreachable and user overrides never flowed through. Now
  // we read the dedicated `choices.cerberusConfig` field via cerberus-config.mjs helpers.
  const cfg = await readJsonSafe(CONFIG_FILE, {});
  return {
    consensusOpts: consensusOptsFromConfig(cfg),
    costCapTokens: costCapFromConfig(cfg),
  };
}

// ── Head prompt templates ──────────────────────────────────────────────────

function headPrompts(task, nonces) {
  const common = `Generate a markdown plan for the task. Output exactly these sections in order:

## Decision
(one short statement of the recommended approach)

## Reasons
- (3+ bullets explaining why)

## Risks / Trade-offs
- (bullets — known limits, edge cases, future work)

## Next Steps
- (concrete implementation steps, bullets)

Constraints: keep total under 400 words. Return ONLY the markdown plan, no preamble.

Task:
${task}`;

  // v0.5.2: nonce challenge. Each head must echo its unique nonce on the very last line so the
  // consensus tool can verify that the orchestrator (Skill / Claude) spawned 3 *distinct* agents
  // and did not fabricate plans. Without the nonce, consensus rejects the call.
  const nonceTail = (head) => `\n\nIMPORTANT (v0.5.2): At the VERY LAST LINE of your output, write exactly this line and nothing after it:\ncerberus-nonce: ${nonces[head]}\n\nIf you omit or modify this line, the consensus call will reject your plan.`;

  return {
    h1: `You are Cerberus Head #1 (Claude-only mode). Generate the plan using ONLY your own reasoning. Do NOT invoke mcp__codex__codex or any external LLM consultation. Reason from first principles based on your training knowledge.\n\n${common}${nonceTail("h1")}`,
    h2: `You are Cerberus Head #2 (Codex-only mode). Delegate the plan generation to Codex via mcp__codex__codex with sandbox=read-only, approval-policy=never. Relay the result. Do NOT add your own Claude-side reasoning — your role is the orchestration channel for Codex.\n\n${common}${nonceTail("h2")}`,
    h3: `You are Cerberus Head #3 (Claude+Codex synergy mode). Form an initial position via your own analysis, then consult Codex via mcp__codex__codex for a second opinion (read-only, approval=never), then reconcile both into a single final plan.\n\n${common}${nonceTail("h3")}`,
  };
}

// v0.5.2: 6-hex nonce per head. Collision probability ≈ 1 / 16M, negligible for plan-only runs.
function newNonces() {
  return {
    h1: crypto.randomBytes(3).toString("hex"),
    h2: crypto.randomBytes(3).toString("hex"),
    h3: crypto.randomBytes(3).toString("hex"),
  };
}

// v0.5.2: extract `cerberus-nonce: <6-hex>` from the last line of a plan markdown.
// Matches the literal "cerberus-nonce:" anchor + 6 hex chars; trailing whitespace tolerated.
export function extractNonce(planText) {
  if (typeof planText !== "string") return null;
  const m = planText.match(/cerberus-nonce:\s*([0-9a-f]{6})\s*$/m);
  return m ? m[1] : null;
}

// ── Tool handlers ──────────────────────────────────────────────────────────

async function toolInit({ task, scope = "head" }) {
  if (typeof task !== "string" || !task.trim()) {
    throw new Error("task is required (non-empty string)");
  }
  if (scope !== "head" && scope !== "full") {
    throw new Error(`scope must be "head" or "full" (got "${scope}")`);
  }
  if (scope === "full") {
    // Disabled in the current release — fail fast with explanation.
    throw new Error('scope="full" is disabled in this release (Cerberus Head mode only). Use scope="head". Full mode ships in a later release.');
  }

  const cfg = await loadConfig();
  const run_id = newRunId();
  const runDir = path.join(RUNS_DIR, run_id);
  const nonces = newNonces();
  const prompts = headPrompts(task, nonces);

  const planState = {
    run_id,
    task,
    scope,
    phase: "awaiting_heads",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    cost_cap_tokens: cfg.costCapTokens || 50000,
    head_prompts: prompts,
    nonces, // v0.5.2: persisted for consensus-time verification
    plans_received: null,
    consensus: null,
  };
  await writeJsonAtomic(path.join(runDir, "plan.json"), planState);
  await appendJsonl(path.join(runDir, "events.jsonl"), { ts: nowIso(), event: "init", run_id, task_preview: task.slice(0, 200) });

  await updateIndex({ run_id, task: task.slice(0, 80), phase: "awaiting_heads", agreement_score: null, createdAt: planState.createdAt });

  return {
    run_id,
    next_action: "spawn_agents",
    agents: ["cerberus-h1-claude-only", "cerberus-h2-codex-only", "cerberus-h3-synergy"],
    head_prompts: [prompts.h1, prompts.h2, prompts.h3],
    validation_nonces: nonces, // v0.5.2: each head's prompt already embeds its nonce; this is for orchestrator inspection only
    nonce_instruction: "Each head plan must end with the line `cerberus-nonce: <value>` matching `validation_nonces[head]`. Plans missing or mis-matched nonces will be rejected at consensus time. Do NOT strip nonce lines before calling consensus.",
    consensus_endpoint: "mcp__cerberus__consensus",
    cost_cap_tokens: planState.cost_cap_tokens,
    state_dir: runDir,
  };
}

async function toolConsensus({ run_id, plans, force = false }) {
  if (!run_id || typeof run_id !== "string") throw new Error("run_id is required");
  if (!Array.isArray(plans) || plans.length !== 3) throw new Error("plans must be an array of exactly 3 entries");

  const runDir = path.join(RUNS_DIR, run_id);
  const planState = await readJsonSafe(path.join(runDir, "plan.json"));
  if (!planState) throw new Error(`unknown run_id: ${run_id}`);
  if (planState.phase === "consensus_done") {
    // Idempotent: return existing consensus if recomputed with same input. New plans → recompute.
    // Cheaper to just always recompute since algorithm is deterministic + cheap.
  }

  // v0.5.2: nonce challenge verification. If init issued nonces (any plan.json created on v0.5.2+),
  // each plan must echo its head-specific nonce. Mismatch indicates the orchestrator fabricated a
  // plan or swapped heads. `force: true` bypasses for test/admin use.
  if (!force && planState.nonces) {
    const mismatches = [];
    for (const p of plans) {
      const expected = planState.nonces[p.head];
      if (!expected) continue;
      const actual = extractNonce(typeof p.plan === "string" ? p.plan : "");
      if (actual !== expected) {
        mismatches.push({ head: p.head, expected, actual: actual || "(missing)" });
      }
    }
    if (mismatches.length > 0) {
      await appendJsonl(path.join(runDir, "events.jsonl"), {
        ts: nowIso(), event: "nonce_reject", run_id, mismatches,
      });
      throw new Error(`nonce verification failed: ${JSON.stringify(mismatches)}. Each head plan must end with "cerberus-nonce: <value>" matching init's validation_nonces. Use force:true only for test/admin bypass.`);
    }
  }

  // Persist raw per-head plans.
  for (const p of plans) {
    if (!p?.head || !["h1","h2","h3"].includes(p.head)) throw new Error(`invalid head in plans: ${p?.head}`);
    await writeJsonAtomic(path.join(runDir, "plans", `${p.head}.json`), {
      head: p.head, plan: p.plan, model: p.model || null, elapsedMs: p.elapsedMs || null, tokens: p.tokens || null, receivedAt: nowIso(),
    });
  }

  const cfg = await loadConfig();
  const result = runConsensus(plans, cfg.consensusOpts);

  const cost_used_tokens = plans.reduce((sum, p) => sum + (Number(p.tokens) || 0), 0);

  const consensusPayload = {
    run_id,
    next_action: "present_to_user",
    consensus_plan: result.consensus_plan,
    agreement_score: result.agreement_score,
    label: result.label,
    dissent: result.dissent,
    chosen_per_topic: result.chosen_per_topic,
    cost_used_tokens,
    cost_remaining: Math.max(0, planState.cost_cap_tokens - cost_used_tokens),
    raw_stats: result.raw,
  };

  await writeJsonAtomic(path.join(runDir, "consensus.json"), consensusPayload);
  planState.phase = "consensus_done";
  planState.updatedAt = nowIso();
  planState.plans_received = plans.map((p) => ({ head: p.head, tokens: p.tokens || null, elapsedMs: p.elapsedMs || null }));
  planState.consensus = { agreement_score: result.agreement_score, label: result.label };
  await writeJsonAtomic(path.join(runDir, "plan.json"), planState);
  await appendJsonl(path.join(runDir, "events.jsonl"), {
    ts: nowIso(), event: "consensus", run_id,
    agreement_score: result.agreement_score, label: result.label,
    groupCounts: result.raw.groupCounts, cost_used_tokens,
  });
  await updateIndex({ run_id, phase: "consensus_done", agreement_score: result.agreement_score });

  return consensusPayload;
}

async function toolStatus({ run_id }) {
  if (!run_id) throw new Error("run_id is required");
  const runDir = path.join(RUNS_DIR, run_id);
  const planState = await readJsonSafe(path.join(runDir, "plan.json"));
  if (!planState) throw new Error(`unknown run_id: ${run_id}`);
  return {
    run_id,
    phase: planState.phase,
    createdAt: planState.createdAt,
    updatedAt: planState.updatedAt,
    costSoFar: planState.consensus ? "consensus_done" : "awaiting_heads",
    iterations: 1,
    agreement_score: planState.consensus?.agreement_score ?? null,
    label: planState.consensus?.label ?? null,
  };
}

async function toolList({ limit = 10 }) {
  const idx = await readJsonSafe(INDEX_FILE, { runs: [] });
  const runs = (idx.runs || []).slice(-limit).reverse();
  return { runs };
}

async function toolInspect({ run_id }) {
  if (!run_id) throw new Error("run_id is required");
  const runDir = path.join(RUNS_DIR, run_id);
  const planState = await readJsonSafe(path.join(runDir, "plan.json"));
  if (!planState) throw new Error(`unknown run_id: ${run_id}`);
  const consensus = await readJsonSafe(path.join(runDir, "consensus.json"));
  const plans = {};
  for (const head of ["h1","h2","h3"]) {
    plans[head] = await readJsonSafe(path.join(runDir, "plans", `${head}.json`));
  }
  // Read events.jsonl line-by-line.
  const events = [];
  try {
    const txt = await fs.readFile(path.join(runDir, "events.jsonl"), "utf8");
    for (const line of txt.split("\n")) { if (line.trim()) events.push(JSON.parse(line)); }
  } catch { /* none */ }
  return { run_id, plan: planState, plans, consensus, events };
}

async function updateIndex(entry) {
  await ensureDir(CERB_DIR);
  const idx = (await readJsonSafe(INDEX_FILE)) || { runs: [] };
  const i = idx.runs.findIndex((r) => r.run_id === entry.run_id);
  if (i >= 0) idx.runs[i] = { ...idx.runs[i], ...entry, updatedAt: nowIso() };
  else idx.runs.push({ ...entry, updatedAt: nowIso() });
  // Cap to last 200 runs to avoid unbounded growth.
  if (idx.runs.length > 200) idx.runs = idx.runs.slice(-200);
  await writeJsonAtomic(INDEX_FILE, idx);
}

// ── Server bootstrap ───────────────────────────────────────────────────────

export async function runCerberusServer() {
  await ensureDir(RUNS_DIR);

  const server = new McpServer({ name: "cerberus", version: "0.5.6" });

  server.registerTool("init", {
    description: "Start a new Cerberus run. Returns run_id + the three head agent names + head prompts + next_action='spawn_agents'.",
    inputSchema: {
      task: z.string().describe("The user's task — what needs a multi-head plan."),
      scope: z.enum(["head", "full"]).optional().describe("'head' (default, plan-only consensus) or 'full' (disabled in current release — ships later)."),
    },
  }, async (args) => {
    const result = await toolInit(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool("consensus", {
    description: "Merge three head plans into a deterministic consensus plan using algorithm (A) — merge non-conflict + tournament on conflicts. v0.5.2: verifies each plan ends with `cerberus-nonce: <value>` matching init's validation_nonces. Returns consensus_plan markdown, agreement_score, dissent.",
    inputSchema: {
      run_id: z.string().describe("The run_id returned by init."),
      plans: z.array(z.object({
        head: z.enum(["h1", "h2", "h3"]),
        plan: z.string().describe("The head's plan, markdown. Must end with `cerberus-nonce: <value>` from init."),
        model: z.string().optional(),
        elapsedMs: z.number().optional(),
        tokens: z.number().optional(),
      })).length(3).describe("Exactly three plans, one per head."),
      force: z.boolean().optional().describe("Bypass nonce verification (test/admin only — do NOT use in production agent flow)."),
    },
  }, async (args) => {
    const result = await toolConsensus(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool("status", {
    description: "Get the phase + agreement score of an existing run.",
    inputSchema: { run_id: z.string() },
  }, async (args) => {
    const result = await toolStatus(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool("list", {
    description: "List recent Cerberus runs (most recent first).",
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async (args) => {
    const result = await toolList(args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool("inspect", {
    description: "Return all raw data (plan state, per-head plans, consensus, events) for a run.",
    inputSchema: { run_id: z.string() },
  }, async (args) => {
    const result = await toolInspect(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive — transport drives the event loop via stdin.
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  runCerberusServer().catch((e) => {
    process.stderr.write(`[cerberus-server] fatal: ${e?.stack || e}\n`);
    process.exit(1);
  });
}
