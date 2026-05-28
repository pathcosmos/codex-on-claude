#!/usr/bin/env node
// codex-on-claude installer / reconfigurer
// Usage:
//   npx --yes codex-on-claude@latest  # canonical: pull latest + auto-reconfigure if state exists
//   codex-on-claude                   # install or reconfigure (auto-detects existing state)
//   codex-on-claude reconfigure       # explicit reconfigure
//   codex-on-claude status            # show current installation state
//   codex-on-claude uninstall         # remove all installed components
//   codex-on-claude --patterns=review,followup --context-policy=mixed --improvement-loop=on-demand --threads=basic --yes
//
// No external dependencies. Pure Node built-ins.

import { promises as fs, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { checkbox, select, confirm } from "@inquirer/prompts";
import { runAnalyze, recordDecision, appendLog } from "./analyze.mjs";
import * as threads from "./threads.mjs";
import * as hooks from "./hooks.mjs";
import { renderTree, renderFile } from "./templater.mjs";
import { seedCerberusConfig } from "./cerberus-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const STATE_DIR = path.join(CLAUDE_DIR, "codex-on-claude");
const STATE_FILE = path.join(STATE_DIR, "config.json");

const MANIFEST_PATH = path.join(__dirname, "manifest.json");
const PKG_JSON_PATH = path.join(__dirname, "..", "package.json");

// ANSI helpers
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};
const log = (...a) => console.log(...a);
const ok = (m) => log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => log(`${c.yellow}!${c.reset} ${m}`);
const err = (m) => log(`${c.red}✗${c.reset} ${m}`);
const info = (m) => log(`${c.cyan}·${c.reset} ${m}`);

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}
async function writeJson(p, obj) {
  // H2 fix: atomic write via temp + rename so the gate / analyzer never reads a half-written
  // config.json (e.g. during a reconfigure). rename(2) is atomic on POSIX within the same FS.
  // A3 fix (final pre-ship): on rename failure (cross-FS, permission), clean up temp file
  // so we don't leak `*.tmp-PID-TS` artifacts in the user's directories. Rethrow original error.
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + "\n");
  try {
    await fs.rename(tmp, p);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(src, dst) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, { recursive: true, force: true });
}

async function removeIfExists(p) {
  if (await pathExists(p)) {
    await fs.rm(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      args.flags[k] = v === undefined ? true : v;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "";
    let stderr = "";
    if (!opts.inherit) {
      p.stdout?.on("data", (d) => (stdout += d.toString()));
      p.stderr?.on("data", (d) => (stderr += d.toString()));
    }
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.on("error", (e) => resolve({ code: -1, stdout, stderr: e.message }));
  });
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function handleInquirerError(e) {
  if (e?.name === "ExitPromptError" || (e?.message || "").includes("force closed")) {
    log("\nCancelled.");
    process.exit(130);
  }
  throw e;
}

async function askMulti(label, choices, defaults = []) {
  if (!isInteractive()) {
    log(`\n${c.bold}${label}${c.reset}`);
    log(`${c.dim}(non-TTY) defaults: ${defaults.join(", ") || "(none)"}${c.reset}`);
    return [...defaults];
  }
  try {
    const picked = await checkbox({
      message: label,
      pageSize: 10,
      choices: choices.map((ch) => ({
        name: ch.label,
        value: ch.key,
        checked: defaults.includes(ch.key),
      })),
      instructions: " (↑/↓ to move · Space to toggle · Enter to confirm)",
    });
    return picked;
  } catch (e) {
    handleInquirerError(e);
  }
}

async function askSingle(label, choices, defaultKey) {
  if (!isInteractive()) {
    log(`\n${c.bold}${label}${c.reset}`);
    log(`${c.dim}(non-TTY) default: ${defaultKey || choices[0].key}${c.reset}`);
    return defaultKey || choices[0].key;
  }
  try {
    const picked = await select({
      message: label,
      pageSize: 10,
      choices: choices.map((ch) => ({ name: ch.label, value: ch.key })),
      default: defaultKey || choices[0].key,
    });
    return picked;
  } catch (e) {
    handleInquirerError(e);
  }
}

async function askConfirm(message, defaultValue = true) {
  if (!isInteractive()) return defaultValue;
  try {
    return await confirm({ message, default: defaultValue });
  } catch (e) {
    handleInquirerError(e);
  }
}

// --- Reconfigure-aware UX helpers ---

function fmtList(v) {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(none)";
  return v == null || v === "" ? "(none)" : String(v);
}

function arraysEqualSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

function formatChange(prev, next, isMulti) {
  const same = isMulti ? arraysEqualSet(prev || [], next || []) : (prev == next);
  if (same) return `kept (${fmtList(next)})`;
  return `changed (${fmtList(prev)}) → (${fmtList(next)})`;
}

function fmtModelSlot(slot) {
  if (!slot || !slot.id) return "(unset)";
  return `${slot.id} · ${slot.reasoning || "?"}`;
}

function renderReviewTable(prev, draft, hasPrev) {
  // [label, draftValue, prevValue, isMulti, suffix?] — `suffix` is rendered
  // alongside but excluded from the same/changed comparison.
  const rows = [
    ["patterns", draft.patterns, prev?.patterns, true],
    ["contextPolicy", draft.contextPolicy, prev?.contextPolicy, false],
    ["improvementLoop", draft.improvementLoop, prev?.improvementLoop, false],
    ["threads", draft.threads, prev?.threads, false],
    ["usageMode", draft.usageMode, prev?.usageMode, false],
    ["autoTier2", draft.autoTier2LLMProbe ? "on" : "off", prev?.autoTier2LLMProbe === false ? "off" : (prev?.autoTier2LLMProbe === true ? "on" : undefined), false, draft.usageMode === "auto" ? "" : "(auto-mode only)"],
    ["cerberus", draft.cerberus || "off", prev?.cerberus, false, "(v0.5.1)"],
    ["sub: claude", draft.subscription?.claude, prev?.subscription?.claude, false],
    ["sub: codex", draft.subscription?.codex, prev?.subscription?.codex, false],
    ["codex primary", fmtModelSlot(draft.model?.codex?.primary), fmtModelSlot(prev?.model?.codex?.primary), false],
    ["codex fallback", fmtModelSlot(draft.model?.codex?.fallback), fmtModelSlot(prev?.model?.codex?.fallback), false, "(locked)"],
    ["reviewer primary", fmtModelSlot(draft.model?.reviewer?.primary), fmtModelSlot(prev?.model?.reviewer?.primary), false],
    ["reviewer fallback", fmtModelSlot(draft.model?.reviewer?.fallback), fmtModelSlot(prev?.model?.reviewer?.fallback), false, "(locked)"],
  ];
  const lines = [];
  for (const [key, next, prv, isMulti, suffix] of rows) {
    const same = isMulti ? arraysEqualSet(prv || [], next || []) : (prv == next);
    const tail = hasPrev
      ? (same ? `(unchanged)` : `(was: ${fmtList(prv)})  ${c.yellow}← changed${c.reset}`)
      : `(new)`;
    const valueCell = suffix ? `${fmtList(next)} ${suffix}` : fmtList(next);
    lines.push(`  ${key.padEnd(18)}: ${valueCell.padEnd(36)} ${c.dim}${tail}${c.reset}`);
  }
  return lines.join("\n");
}

async function askReviewDecision() {
  if (!isInteractive()) return "apply";
  try {
    return await select({
      message: "Review your selections — Confirm?",
      choices: [
        { name: "Apply", value: "apply" },
        { name: "Edit again", value: "edit" },
        { name: "Cancel", value: "cancel" },
      ],
      default: "apply",
    });
  } catch (e) {
    handleInquirerError(e);
  }
}

async function loadState() {
  if (!(await pathExists(STATE_FILE))) return null;
  try {
    return await readJson(STATE_FILE);
  } catch {
    return null;
  }
}

async function saveState(state) {
  await writeJson(STATE_FILE, { ...state, updatedAt: new Date().toISOString() });
}

function parseListFlag(v) {
  if (v === undefined || v === true) return undefined;
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

async function preflight({ autoYes }) {
  log(`${c.bold}0. Preflight${c.reset}`);
  const codexPath = which("codex");
  const claudePath = which("claude");
  let nodeOk = true;
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 18) {
    err(`Node.js ${process.versions.node} — 18.17+ required`);
    nodeOk = false;
  } else {
    ok(`Node.js ${process.versions.node}`);
  }

  let hardFail = !nodeOk;

  if (codexPath) {
    const r = await run("codex", ["--version"]);
    const version = (r.stdout || r.stderr).trim().split("\n")[0];
    if (r.code === 0) ok(`Codex CLI: ${codexPath} (${version})`);
    else warn(`Codex CLI found at ${codexPath} but --version failed: ${r.stderr}`);
  } else {
    err(`Codex CLI (codex) not on PATH`);
    info(`Install:`);
    info(`  npm i -g @openai/codex`);
    info(`  or https://github.com/openai/codex`);
    hardFail = true;
  }

  if (claudePath) {
    const r = await run("claude", ["--version"]);
    const version = (r.stdout || r.stderr).trim().split("\n")[0];
    if (r.code === 0) ok(`Claude Code: ${claudePath} (${version})`);
    else warn(`Claude Code found at ${claudePath} but --version failed: ${r.stderr}`);
  } else {
    err(`Claude Code (claude) not on PATH`);
    info(`Install:`);
    info(`  https://docs.claude.com/en/docs/claude-code/quickstart`);
    info(`  or https://claude.ai/download`);
    hardFail = true;
  }

  if (hardFail) {
    if (autoYes) {
      err("Refusing to proceed with --yes while required CLIs are missing. Install them and retry.");
      process.exit(2);
    }
    const proceed = await askConfirm("Required CLIs are missing. Continue anyway?", false);
    if (!proceed) {
      info("Aborting install. Install the missing CLIs and retry.");
      process.exit(2);
    }
    warn("Proceeding with missing CLIs — some steps may fail.");
  }

  // Soft health checks (non-blocking)
  if (codexPath) {
    const r = await run("codex", ["doctor", "--summary"]);
    if (r.code === 0 && /\bok\b/i.test(r.stdout)) {
      ok(`codex doctor: ok`);
    } else {
      warn(`codex doctor: not OK — check auth/network`);
      if (r.stdout) info(`  summary: ${r.stdout.split("\n").slice(0, 2).join(" | ")}`);
    }
  }

  if (claudePath) {
    const r = await run("claude", ["auth", "status", "--text"]);
    if (r.code === 0 && /Login method/i.test(r.stdout)) {
      const line = (r.stdout.split("\n").find((l) => /Login method/i.test(l)) || "").trim();
      ok(`Claude auth: ${line || "ok"}`);
    } else {
      warn(`Claude auth state unclear — run \`claude auth login --claudeai\` if needed`);
    }
  }

  // codex MCP server registration check — external automation often needs this confirmed up front
  if (claudePath) {
    const r = await run("claude", ["mcp", "get", "codex"]);
    const combined = (r.stdout + r.stderr).toLowerCase();
    if (r.code === 0 && combined.includes("connected")) {
      ok(`codex MCP server: ✓ Connected`);
    } else if (r.code === 0) {
      warn(`codex MCP appears registered but connection status unclear — verify with \`claude mcp list\``);
    } else {
      warn(`codex MCP not registered — install will attempt auto-registration. Manual: \`claude mcp add --scope user codex -- codex mcp-server\``);
    }
  }

  // Self-check: is `codex-on-claude` reachable on PATH, and does it match the running script?
  // Catches the common "command not found right after npm update -g" stale-shell-hash case.
  try {
    const selfPath = process.argv[1] || "";
    const whichPath = which("codex-on-claude");
    if (!whichPath) {
      info(`codex-on-claude not on PATH. Run via \`npx --yes codex-on-claude@latest\`, or add the npm global bin dir (\`npm bin -g\`) to PATH.`);
    } else {
      let selfReal = selfPath;
      let whichReal = whichPath;
      try { selfReal = (await fs.realpath(selfPath)); } catch {}
      try { whichReal = (await fs.realpath(whichPath)); } catch {}
      if (selfReal && whichReal && selfReal !== whichReal && !/\/_npx\//.test(selfReal)) {
        warn(`Stale shell command hash: this run is ${selfPath} but \`which codex-on-claude\` resolves to ${whichPath}. Run \`hash -r\` or open a new terminal.`);
      } else {
        ok(`codex-on-claude on PATH: ${whichPath}`);
      }
    }
  } catch {
    // best-effort — never let self-check abort preflight
  }

  return { codexPath, claudePath };
}

// v0.5.1: normalize manifest.mcp to an array. Legacy single-object form is preserved for
// backward-compat; new code paths walk the array so additional MCP servers (e.g. cerberus)
// can be registered alongside codex.
function getMcpServers(manifest) {
  if (!manifest?.mcp) return [];
  return Array.isArray(manifest.mcp) ? manifest.mcp : [manifest.mcp];
}

async function checkOneMcp(server) {
  const r = await run("claude", ["mcp", "get", server.name]);
  const combined = (r.stdout + r.stderr).toLowerCase();
  if (r.code === 0 && combined.includes("connected")) {
    ok(`MCP server "${server.name}" already registered and connected`);
    return { name: server.name, state: "connected" };
  }
  if (r.code === 0) {
    warn(`MCP server "${server.name}" registered but connection status unclear.`);
    return { name: server.name, state: "registered-but-unhealthy" };
  }
  info(`MCP server "${server.name}" not registered — registration command: ${server.registerCommand}`);
  return { name: server.name, state: "missing" };
}

async function checkMcp(manifest) {
  if (!which("claude")) {
    warn("Claude Code CLI (claude) not on PATH. Skipping MCP auto-registration.");
    return { state: "missing-cli", servers: [] };
  }
  const servers = getMcpServers(manifest);
  const results = [];
  for (const s of servers) results.push(await checkOneMcp(s));
  // Backward-compat: report the first server's state at the top level so legacy state file
  // (newState.mcp.{name,status}) keeps its old shape — older `codex-on-claude status` reads
  // those single fields. Multi-server status is exposed via `servers[]`.
  const primary = results[0] || { name: null, state: "missing-cli" };
  return { state: primary.state, name: primary.name, servers: results };
}

async function offerMcpRegister(manifest, autoYes) {
  if (!which("claude")) return;
  const servers = getMcpServers(manifest);
  for (const server of servers) {
    // Skip if already registered (idempotent — re-running install shouldn't double-register).
    const check = await run("claude", ["mcp", "get", server.name]);
    if (check.code === 0) {
      continue;
    }
    const register = autoYes ? true : await askConfirm(`Register MCP server "${server.name}" now?`, true);
    if (!register) {
      info(`Skipping MCP registration for "${server.name}".`);
      continue;
    }
    const r = await run("claude", ["mcp", "add", "--scope", "user", server.name, "--", server.command, ...(server.args || [])]);
    if (r.code === 0) ok(`MCP server "${server.name}" registered.`);
    else err(`MCP registration failed for "${server.name}": ${r.stderr || r.stdout}`);
  }
}

function selectedSkills(manifest, patterns, improvementLoop, threadsMode, cerberus) {
  const set = new Set();
  for (const ch of manifest.questions.patterns.choices) {
    if (patterns.includes(ch.key)) {
      for (const s of ch.skills) set.add(s);
    }
  }
  const loopChoice = manifest.questions.improvementLoop.choices.find((c) => c.key === improvementLoop);
  if (loopChoice?.installAnalyzeSkill) {
    set.add("codex-analyze");
    set.add("codex-improve");
    set.add("codex-log");
  }
  const threadsChoice = manifest.questions.threads?.choices.find((c) => c.key === threadsMode);
  if (threadsChoice?.installThreadsSkill) {
    set.add("codex-threads");
  }
  // v0.5.1: Cerberus opt-in adds the codex-cerberus Skill. The 3 head agents are added
  // separately in applyInstallation via `cerberusWanted = desiredSkills.has("codex-cerberus")`.
  if (cerberusEnabled(manifest, cerberus)) {
    set.add("codex-cerberus");
  }
  return [...set];
}

function cerberusEnabled(manifest, cerberusKey) {
  const ch = manifest.questions.cerberus?.choices.find((c) => c.key === cerberusKey);
  return ch ? !!ch.enable : false;
}

function threadsEnabled(manifest, threadsMode) {
  const ch = manifest.questions.threads?.choices.find((c) => c.key === threadsMode);
  return ch ? !!ch.enableThreads : false;
}

function shouldInstallAgent(manifest, contextPolicy) {
  const ch = manifest.questions.contextPolicy.choices.find((c) => c.key === contextPolicy);
  return ch ? !!ch.installAgent : false;
}

function loggingEnabled(manifest, improvementLoop) {
  const ch = manifest.questions.improvementLoop.choices.find((c) => c.key === improvementLoop);
  return ch ? !!ch.enableLogging : false;
}

function hooksEnabled(manifest, improvementLoop) {
  const ch = manifest.questions.improvementLoop.choices.find((c) => c.key === improvementLoop);
  return ch ? !!ch.registerHooks : false;
}

function normalizeImprovementLoop(manifest, value) {
  if (!value) return value;
  const aliases = manifest.questions.improvementLoop?.aliases || {};
  return aliases[value] || value;
}

// ===== Model matrix + subscription helpers (v0.4.1) =====

function tierEntry(manifest, side, tier) {
  return manifest.modelMatrix?.[side]?.[tier] || null;
}

function defaultSubscription(side) {
  // Reasonable defaults for first-run users — recommendation matches manifest labels.
  return side === "claude" ? "max" : "pro";
}

function allowedSubscriptions(manifest, side) {
  return Object.keys(manifest.modelMatrix?.[side] || {});
}

function defaultPrimaryFor(manifest, side, tier) {
  const t = tierEntry(manifest, side, tier);
  if (!t) return null;
  // Default primary = "best non-base option in the tier", falling back to base.
  const firstNonBase = t.models.find((m) => m !== t.base.id) || t.base.id;
  const firstReasoning = t.reasoning[0] || t.base.reasoning;
  return { id: firstNonBase, reasoning: firstReasoning };
}

function fallbackFor(manifest, side, tier) {
  const t = tierEntry(manifest, side, tier);
  if (!t) return { id: "?", reasoning: "?" };
  return { id: t.base.id, reasoning: t.base.reasoning };
}

function validateModelChoice(manifest, side, tier, choice) {
  const t = tierEntry(manifest, side, tier);
  if (!t) return { ok: false, reason: `unknown ${side} subscription "${tier}"` };
  if (!choice?.id) return { ok: false, reason: `${side} model id missing` };
  if (!t.models.includes(choice.id)) {
    return { ok: false, reason: `${side} model "${choice.id}" not in tier "${tier}". Allowed: ${t.models.join(", ")}` };
  }
  if (!choice.reasoning) return { ok: false, reason: `${side} reasoning level missing` };
  if (!t.reasoning.includes(choice.reasoning)) {
    return { ok: false, reason: `${side} reasoning "${choice.reasoning}" not in tier "${tier}". Allowed: ${t.reasoning.join(", ")}` };
  }
  return { ok: true };
}

function clampToTier(manifest, side, tier, choice) {
  // Best-effort: if a prior install's choice is no longer valid (e.g. subscription downgrade),
  // snap it back to the tier's defaults rather than silently writing invalid state.
  const v = validateModelChoice(manifest, side, tier, choice);
  if (v.ok) return choice;
  return defaultPrimaryFor(manifest, side, tier);
}

function buildModelVars(state) {
  // Returns the object passed to the templater. Includes both the structured
  // `model.<side>.<slot>.<field>` paths AND short aliases so Skill prose can
  // reference them ergonomically.
  const m = state.choices?.model || {};
  const mode = state.choices?.usageMode || "synergy";
  const guardrails = state.choices?.guardrails || {};
  // v0.5.0: mode-aware prose snippets (read by SKILL.md preambles via {{modeBehavior}})
  const modeBehaviorTable = {
    none:    "🚫 Codex calls are blocked at the hook gate. This Skill returns to α without invoking Codex unless the user explicitly overrides.",
    synergy: "🎯 Follow the v9 Quick-Ref 3-Q decision tree (ceiling → chain+strict → adversarial → partial-fail). Apply R1-R6 recipes when matched.",
    auto:    "🔍 Detect signals first (`install/detect-signals.mjs`). If heuristic confidence < 0.7 and Tier 2 probe is on, classify via Codex before deciding.",
    max:     "⚡ Quality-first bounded automation. R1 default ON for review tasks, R5 always probe, γ hot-swap on P5 catastrophe — hard DO-NOT rules still enforced.",
  };
  // L2-found: previous expression had a TDZ self-reference (`modeBehavior?.synergy` on the RHS of its own
  // declaration). Now uses a separate table + explicit fallback chain so unknown modes degrade gracefully.
  const modeBehavior = modeBehaviorTable[mode] || modeBehaviorTable.synergy || "(unknown mode)";
  return {
    subscription: state.choices?.subscription || {},
    model: m,
    // shortcut aliases (handy inside Skill prose)
    codexPrimaryModel: m.codex?.primary?.id,
    codexPrimaryReasoning: m.codex?.primary?.reasoning,
    codexFallbackModel: m.codex?.fallback?.id,
    codexFallbackReasoning: m.codex?.fallback?.reasoning,
    reviewerPrimaryModel: m.reviewer?.primary?.id,
    reviewerPrimaryReasoning: m.reviewer?.primary?.reasoning,
    reviewerFallbackModel: m.reviewer?.fallback?.id,
    reviewerFallbackReasoning: m.reviewer?.fallback?.reasoning,
    // v0.5.0 usage-mode placeholders
    usageMode: mode,
    modeBehavior,
    autoTier2LLMProbe: state.choices?.autoTier2LLMProbe === false ? "off" : "on",
    guardrailChainJson: guardrails.chainJsonTrap || "hard-block",
    guardrailSubagent: guardrails.subagentStrict || "hard-block",
    guardrailTurnBurn: guardrails.turnBurn || "3-turn-stop",
    guardrailCeiling: guardrails.ceilingNoUpside || "warn-and-skip",
  };
}

async function applyInstallation(manifest, choices, previousState) {
  const desiredSkills = new Set(selectedSkills(manifest, choices.patterns, choices.improvementLoop, choices.threads, choices.cerberus));
  const desiredAgent = shouldInstallAgent(manifest, choices.contextPolicy);
  const desiredLogging = loggingEnabled(manifest, choices.improvementLoop);
  const desiredThreads = threadsEnabled(manifest, choices.threads);
  const templateVars = buildModelVars({ choices });

  // H7 fix: restrict state directories to user-only (0700). README claims this; without it
  // logs (which may contain prompts) + thread catalogs would be world-readable on a shared box.
  // Best-effort: errors are swallowed (POSIX chmod is a no-op on some FS, e.g. fat32).
  async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
    try { await fs.chmod(dir, 0o700); } catch { /* best-effort */ }
  }
  await ensureDir(STATE_DIR);

  if (desiredLogging) {
    await ensureDir(path.join(STATE_DIR, "logs"));
    await ensureDir(path.join(STATE_DIR, "reports"));
    await ensureDir(path.join(STATE_DIR, "improvements"));
  }
  if (desiredThreads) {
    await ensureDir(path.join(STATE_DIR, "threads"));
  }

  const installed = { skills: [], agent: null, removed: [], helpers: [] };

  // A2 fix (final pre-ship): copy auto-mode helper modules into the well-known install path.
  // SKILL.md auto-mode preamble references `node ~/.claude/codex-on-claude/install/detect-signals.mjs`;
  // without these copies, that path is empty and Claude's auto-mode classification fails silently.
  // Idempotent — re-running overwrites with the current package version (intentional: keep helpers in sync).
  const helperSrcs = [
    ["detect-signals.mjs", path.join(__dirname, "detect-signals.mjs")],
    ["auto-probe.mjs", path.join(__dirname, "auto-probe.mjs")],
  ];
  const helperDstDir = path.join(STATE_DIR, "install");
  await ensureDir(helperDstDir);
  for (const [name, src] of helperSrcs) {
    if (await pathExists(src)) {
      await fs.copyFile(src, path.join(helperDstDir, name));
      installed.helpers.push(name);
    }
  }

  // Skills install / diff
  const previousSkills = new Set((previousState?.installed?.skills) || []);

  for (const skillKey of desiredSkills) {
    const def = manifest.skills[skillKey];
    if (!def) {
      warn(`No definition for ${skillKey} in manifest.`);
      continue;
    }
    const src = path.join(__dirname, def.source);
    const dst = path.join(CLAUDE_DIR, def.target);
    if (!(await pathExists(src))) {
      err(`Source missing: ${src}`);
      continue;
    }
    const { rendered } = await renderTree(src, dst, templateVars);
    installed.skills.push(skillKey);
    ok(`Skill installed/updated: ${skillKey} → ${dst}${rendered ? ` (templated ${rendered} file${rendered === 1 ? "" : "s"})` : ""}`);
  }

  // Remove skills that were previously installed but no longer desired
  for (const prev of previousSkills) {
    if (!desiredSkills.has(prev)) {
      const def = manifest.skills[prev];
      if (!def) continue;
      const dst = path.join(CLAUDE_DIR, def.target);
      if (await removeIfExists(dst)) {
        installed.removed.push(`skills/${prev}`);
        info(`Removed previous Skill: ${prev}`);
      }
    }
  }

  // Agent install / removal — primary + fallback (reviewer agents) + cerberus heads (v0.5.1).
  // The reviewer agents are gated on `desiredAgent` (contextPolicy=mixed/summarize); the cerberus
  // heads are gated on whether the codex-cerberus Skill is in `desiredSkills` — they exist purely
  // to back that Skill's 3-head spawn pattern.
  const cerberusWanted = desiredSkills.has("codex-cerberus");
  const cerberusAgents = (manifest.cerberusAgents || []).map((def) => ({ def, slot: "cerberus", wanted: cerberusWanted }));
  const reviewerAgents = [
    { def: manifest.agent, slot: "primary", wanted: desiredAgent },
    ...(manifest.agentFallback ? [{ def: manifest.agentFallback, slot: "fallback", wanted: desiredAgent }] : []),
  ];
  const agentDefs = [...reviewerAgents, ...cerberusAgents];
  installed.agents = [];
  for (const { def, slot, wanted } of agentDefs) {
    if (!def) continue;
    const target = path.join(CLAUDE_DIR, def.target);
    if (wanted) {
      const src = path.join(__dirname, def.source);
      if (!(await pathExists(src))) {
        err(`Agent source missing: ${src}`);
        continue;
      }
      await renderFile(src, target, templateVars);
      installed.agents.push(def.name);
      ok(`Agent (${slot}) installed/updated: ${def.name} → ${target}`);
    } else if (previousState?.installed?.agents?.includes(def.name) || previousState?.installed?.agent === def.name) {
      if (await removeIfExists(target)) {
        installed.removed.push(`agents/${def.name}`);
        info(`Removed previous Agent: ${def.name}`);
      }
    }
  }
  // Backward-compat single-agent field — keep pointing to the primary reviewer agent so legacy
  // readers (older `codex-on-claude status`) still see the codex-reviewer name, not a cerberus head.
  installed.agent = manifest.agent && installed.agents.includes(manifest.agent.name) ? manifest.agent.name : (installed.agents[0] || null);

  // Plugin bundle: deprecated in 0.3.0. Existing 0.2.x bundles are left in place — emit one-time hint.
  if (previousState?.installed?.pluginBundle || previousState?.choices?.shareScope === "team") {
    warn(`Plugin bundle auto-management is deprecated since v0.3. Existing directory left in place.`);
    info(`  Manual removal: rm -rf "$HOME/.claude/plugins/marketplaces/codex-bridge"`);
  }

  // PostToolUse hooks for auto-on-skill / periodic
  const desiredHooks = hooksEnabled(manifest, choices.improvementLoop);
  const cocBin = which("codex-on-claude");
  const hookCommand = cocBin
    ? `${cocBin} log --from-stdin`
    : `node ${path.resolve(__dirname, "install.mjs")} log --from-stdin`;
  if (desiredHooks) {
    try {
      const r = await hooks.install({ command: hookCommand });
      ok(`PostToolUse hooks installed (${r.addedGroups}): ${r.settingsFile}`);
      installed.hooks = true;
    } catch (e) {
      err(`PostToolUse hook installation failed: ${e.message}`);
    }
  } else if (previousState?.installed?.hooks) {
    try {
      const r = await hooks.remove();
      info(`PostToolUse hooks removed (${r.removedGroups})`);
      installed.hooks = false;
    } catch (e) {
      err(`PostToolUse hook removal failed: ${e.message}`);
    }
  }

  // v0.5.0: PreToolUse usage-mode gate.
  // H2 fix: bake the enforce-mode into the hook command so the gate decision is race-free.
  //   When mode=none, the gate command is `... gate --from-stdin --enforce-mode=none` — the
  //   gate trusts this flag and never reads config.json, eliminating the toggle-race window
  //   between settings.json and config.json writes.
  // H3 fix: ALWAYS reconcile against actual settings.json state (not just previousState claim).
  //   Previously `installed.gateHooks=false` in state would skip cleanup even when settings.json
  //   actually had stale gate entries from manual edits or prior installs.
  const gateBase = cocBin
    ? `${cocBin} gate --from-stdin`
    : `node ${path.resolve(__dirname, "install.mjs")} gate --from-stdin`;
  const gateCommand = choices.usageMode === "none" ? `${gateBase} --enforce-mode=none` : gateBase;

  let actualGateState;
  try { actualGateState = await hooks.gateStatus(); }
  catch (e) { actualGateState = { present: 0 }; warn(`Could not read gate state: ${e.message}`); }

  if (choices.usageMode === "none") {
    try {
      // installGate is idempotent (strips prior marker entries first) so re-running is safe.
      const r = await hooks.installGate({ command: gateCommand });
      ok(`PreToolUse gate installed (${r.addedGroups}): mode=none blocks Codex MCP + Bash CLI calls`);
      installed.gateHooks = true;
    } catch (e) {
      err(`PreToolUse gate installation failed: ${e.message}`);
    }
  } else {
    // Mode is not 'none' — gate should not exist. Reconcile actual state regardless of previousState claim.
    if (actualGateState.present > 0) {
      try {
        const r = await hooks.removeGate();
        info(`PreToolUse gate reconciled (removed ${r.removedGroups}) — mode=${choices.usageMode} does not need enforcement`);
        installed.gateHooks = false;
      } catch (e) {
        err(`PreToolUse gate removal failed: ${e.message}`);
      }
    } else {
      installed.gateHooks = false;
    }
  }

  // v0.5.1: when cerberus is turned off, surface an info line if the cerberus MCP server is still
  // registered. We don't auto-remove (user might be using it from another project / scope) — the
  // user runs `claude mcp remove cerberus -s user` themselves. Pre-checked via `which claude`.
  if (!cerberusWanted && which("claude")) {
    try {
      const r = await run("claude", ["mcp", "get", "cerberus"]);
      if (r.code === 0) {
        warn(`cerberus=off but the cerberus MCP server is still registered. Remove with: claude mcp remove cerberus -s user`);
      }
    } catch { /* best-effort */ }
  }

  return installed;
}

async function cmdStatus() {
  const state = await loadState();
  if (!state) {
    info("Not installed yet. Run `codex-on-claude` or `codex-on-claude reconfigure`.");
    return;
  }
  log(`${c.bold}codex-on-claude status${c.reset}`);
  log(`  Updated: ${state.updatedAt || "-"}`);
  log(`  patterns: ${(state.choices.patterns || []).join(", ") || "(none)"}`);
  log(`  contextPolicy: ${state.choices.contextPolicy}`);
  log(`  improvementLoop: ${state.choices.improvementLoop || "(unset)"}`);
  log(`  threads: ${state.choices.threads || "(unset)"}`);
  log(`  usageMode: ${state.choices.usageMode || "(unset)"}${state.choices.usageMode === "auto" ? `  ${c.dim}(Tier 2 probe: ${state.choices.autoTier2LLMProbe === false ? "off" : "on"})${c.reset}` : ""}`);
  log(`  cerberus: ${state.choices.cerberus || "off"}  ${c.dim}(v0.5.1 multi-head consensus)${c.reset}`);
  if (state.choices.subscription) {
    log(`  subscription: claude=${state.choices.subscription.claude || "?"}  codex=${state.choices.subscription.codex || "?"}`);
  }
  if (state.choices.model) {
    const cp = state.choices.model.codex?.primary;
    const cf = state.choices.model.codex?.fallback;
    const rp = state.choices.model.reviewer?.primary;
    const rf = state.choices.model.reviewer?.fallback;
    if (cp) log(`  codex   : primary ${cp.id}/${cp.reasoning}  ${c.dim}fallback ${cf?.id}/${cf?.reasoning}${c.reset}`);
    if (rp) log(`  reviewer: primary ${rp.id}/${rp.reasoning}  ${c.dim}fallback ${rf?.id}/${rf?.reasoning}${c.reset}`);
  }
  log(`  Skills installed: ${(state.installed?.skills || []).join(", ") || "(none)"}`);
  const agents = state.installed?.agents || (state.installed?.agent ? [state.installed.agent] : []);
  log(`  Agent(s) installed: ${agents.join(", ") || "(none)"}`);
  try {
    const hookStatus = await hooks.status();
    log(`  PostToolUse hooks: ${hookStatus.present ? `${hookStatus.present} (${hookStatus.matchers.join(", ")})` : "(none)"}`);
  } catch { /* settings file missing */ }
  try {
    const gateHookStatus = await hooks.gateStatus();
    log(`  PreToolUse gate:   ${gateHookStatus.present ? `${gateHookStatus.present} (${gateHookStatus.matchers.join(", ")}) — mode=none enforcement` : "(none)"}`);
  } catch { /* settings file missing */ }
  if (state.choices.shareScope || state.installed?.pluginBundle) {
    log(`  ${c.dim}(legacy) shareScope: ${state.choices.shareScope || "-"}, pluginBundle: ${state.installed?.pluginBundle || "-"} — managed surface ended in v0.3${c.reset}`);
  }
}

async function cmdAnalyze(args) {
  const days = parseInt(args.flags["days"], 10) || 14;
  const format = typeof args.flags["format"] === "string" ? args.flags["format"] : "text";
  const save = args.flags["save"] === true;
  const output = await runAnalyze({ days, format, save });
  process.stdout.write(output + "\n");
}

async function cmdSuggest(args) {
  const applyIdx = args.flags["apply"];
  const rejectIdx = args.flags["reject"];
  const reason = typeof args.flags["reason"] === "string" ? args.flags["reason"] : null;

  // Re-run analyze to get the same candidate list
  const reportJson = await runAnalyze({ days: parseInt(args.flags["days"], 10) || 14, format: "json" });
  const report = JSON.parse(reportJson);

  if (applyIdx === undefined && rejectIdx === undefined) {
    process.stdout.write("Provide --apply=N or --reject=N. List candidates with `codex-on-claude analyze`.\n");
    return;
  }
  const idx = parseInt(applyIdx ?? rejectIdx, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= report.candidates.length) {
    err("Invalid candidate number.");
    return;
  }
  const cand = report.candidates[idx];
  const decision = applyIdx !== undefined ? "applied" : "rejected";
  const file = await recordDecision({
    candidateId: cand.id,
    category: cand.category,
    decision,
    appliedChanges: decision === "applied" ? cand.applyHint || null : null,
    reason,
  });
  ok(`Decision recorded: ${decision} [${cand.id}] → ${file}`);
  if (decision === "applied" && cand.applyHint) {
    info(`Apply with: ${cand.applyHint}`);
    info("Run the above directly, or invoke /codex-improve for guided steps.");
  }
}

async function cmdThreads(args) {
  const sub = args._[1];
  const f = args.flags;
  const tid = args._[2];
  // F3 (v0.5.6): validation in threads.mjs (setStatus/setFallback/createOrUpdate …) throws on bad
  // input; without this catch the raw stack trace leaks to the user. Surface a clean one-liner.
  try {
  switch (sub) {
    case "list": {
      const items = await threads.listAll({
        status: typeof f.status === "string" ? f.status : undefined,
        tag: typeof f.tag === "string" ? f.tag : undefined,
        since: typeof f.since === "string" ? f.since : undefined,
        originatingSkill: typeof f.skill === "string" ? f.skill : undefined,
        limit: parseInt(f.limit, 10) || 50,
      });
      process.stdout.write(threads.renderList(items) + "\n");
      return;
    }
    case "latest": {
      const meta = await threads.latest({ status: typeof f.status === "string" ? f.status : undefined });
      if (!meta) { process.stderr.write("(no threads)\n"); process.exit(1); }
      const fmt = typeof f.format === "string" ? f.format : "id";
      if (fmt === "id") { process.stdout.write(meta.threadId + "\n"); return; }
      if (fmt === "json") {
        const full = await threads.get(meta.threadId);
        process.stdout.write(JSON.stringify(full, null, 2) + "\n");
        return;
      }
      // fall back to render
      process.stdout.write(threads.renderList([meta]) + "\n");
      return;
    }
    case "show": {
      const t = await threads.get(tid);
      if (!t) { err(`thread not found: ${tid}`); process.exit(1); }
      process.stdout.write(threads.renderShow(t) + "\n");
      return;
    }
    case "new": case "upsert": case "touch": {
      if (!tid) { err("threadId required"); process.exit(1); }
      const t = await threads.createOrUpdate(tid, {
        title: typeof f.title === "string" ? f.title : undefined,
        tags: typeof f.tags === "string" ? f.tags.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        originatingSkill: typeof f.skill === "string" ? f.skill : undefined,
        originatingCwd: typeof f.cwd === "string" ? f.cwd : undefined,
        scope: (typeof f.files === "string" || typeof f.sandbox === "string" || typeof f["approval-policy"] === "string") ? {
          files: typeof f.files === "string" ? f.files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          sandbox: typeof f.sandbox === "string" ? f.sandbox : undefined,
          approvalPolicy: typeof f["approval-policy"] === "string" ? f["approval-policy"] : undefined,
        } : undefined,
        fallbackStrategy: typeof f.fallback === "string" ? f.fallback : undefined,
        bumpTurn: f["bump-turn"] === true || f["bump-turn"] === "true",
      });
      ok(`upsert: ${t.threadId}  (turns=${t.turnCount})`);
      return;
    }
    case "goal": case "outcome": case "decision": case "note": {
      const text = args._.slice(3).join(" ");
      if (!tid || !text) { err("usage: threads <kind> <threadId> \"text...\""); process.exit(1); }
      await threads.addSummary(tid, sub, text);
      ok(`${sub} added to ${tid}`);
      return;
    }
    case "incident": {
      if (!tid) { err("threadId required"); process.exit(1); }
      await threads.addIncident(tid, {
        issue: typeof f.issue === "string" ? f.issue : "",
        resolution: typeof f.resolution === "string" ? f.resolution : "",
        outcome: typeof f.outcome === "string" ? f.outcome : null,
      });
      ok(`incident recorded for ${tid}`);
      return;
    }
    case "tag": {
      if (!tid) { err("threadId required"); process.exit(1); }
      const add = typeof f.add === "string" ? f.add.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const remove = typeof f.remove === "string" ? f.remove.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const t = await threads.setTags(tid, { add, remove });
      ok(`tags: ${(t.tags || []).join(", ") || "(none)"}`);
      return;
    }
    case "status": {
      if (!tid || !args._[3]) { err("usage: threads status <id> <active|resolved|archived>"); process.exit(1); }
      await threads.setStatus(tid, args._[3]);
      ok(`status → ${args._[3]}`);
      return;
    }
    case "fallback": {
      if (!tid || !args._[3]) { err("usage: threads fallback <id> <auto-resume|ask|new>"); process.exit(1); }
      await threads.setFallback(tid, args._[3]);
      ok(`fallback → ${args._[3]}`);
      return;
    }
    case "search": {
      const q = args._.slice(2).join(" ");
      if (!q) { err("usage: threads search \"query\""); process.exit(1); }
      const items = await threads.search(q, { limit: parseInt(f.limit, 10) || 25 });
      process.stdout.write(threads.renderList(items) + "\n");
      return;
    }
    case "remove": case "delete": {
      if (!tid) { err("threadId required"); process.exit(1); }
      const removed = await threads.remove(tid);
      ok(removed ? `removed: ${tid}` : `not found: ${tid}`);
      return;
    }
    case "resume": {
      if (!tid) { err("threadId required"); process.exit(1); }
      const prompt = args._.slice(3).join(" ");
      const t = await threads.get(tid);
      if (!t) { err(`thread not found: ${tid}`); process.exit(1); }
      const strategy = t.fallbackStrategy || "ask";
      if (strategy === "ask") {
        info(`thread ${tid} fallback=ask — choose codex exec resume or mcp__codex__codex-reply manually`);
        info(`  meta: title="${t.title || ""}" tags=${(t.tags||[]).join(",")} skill=${t.originatingSkill}`);
        info(`  recent summaries: ${(t.summaries||[]).slice(-3).map((s)=>`[${s.kind}] ${s.text}`).join(" | ") || "(none)"}`);
        return;
      }
      if (strategy === "new") {
        info(`thread ${tid} fallback=new — start a fresh mcp__codex__codex call with the same cwd/sandbox`);
        info(`  hint cwd=${t.originatingCwd || "?"} sandbox=${t.scope?.sandbox || "?"}`);
        return;
      }
      // auto-resume
      if (!prompt) { err("usage: threads resume <id> \"prompt...\""); process.exit(1); }
      info(`auto-resume via: codex exec resume --skip-git-repo-check --json ${tid} "<prompt>"`);
      const r = await run("codex", ["exec", "resume", "--skip-git-repo-check", "--json", tid, prompt]);
      if (r.code === 0) {
        // Detect silent new-session: codex CLI 0.131 silently starts a new thread when the given id is unknown
        const m = r.stdout.match(/"thread_id"\s*:\s*"([^"]+)"/);
        const returnedTid = m ? m[1] : null;
        if (returnedTid && returnedTid !== tid) {
          err(`SILENT_NEW_SESSION: codex returned a different threadId (${returnedTid}) for resume of ${tid}.`);
          err(`  This usually means the original thread was not found and codex silently started a NEW session.`);
          await threads.addIncident(tid, {
            issue: "silent-new-session",
            resolution: `codex created new threadId ${returnedTid} instead of resuming`,
            outcome: "lost-context",
          });
          // Register the new thread separately so the user can see the bifurcation
          await threads.createOrUpdate(returnedTid, {
            originatingSkill: "codex-resume-bifurcation",
            title: `(silent new session from resume of ${tid.slice(0, 8)})`,
          });
        } else {
          ok("resume succeeded (same threadId returned)");
          await threads.createOrUpdate(tid, { bumpTurn: true });
        }
        process.stdout.write(r.stdout);
      } else {
        err(`resume failed (code ${r.code})`);
        await threads.addIncident(tid, { issue: "auto-resume-failed", resolution: r.stderr.split("\n")[0] || "unknown", outcome: "open" });
      }
      return;
    }
    default:
      process.stdout.write(`threads subcommands:
  list [--status=active|resolved|archived] [--tag=...] [--since=7d|2026-05-01] [--skill=...] [--limit=N]
  latest [--status=...] [--format=id|json]   # most-recent thread (deterministic for external automation)
  show <id>
  new|upsert|touch <id> [--title="..."] [--tags=a,b] [--skill=...] [--cwd=...] [--sandbox=read-only] [--files=a,b] [--approval-policy=...] [--fallback=auto-resume|ask|new] [--bump-turn]
  goal|outcome|decision|note <id> "text..."
  incident <id> --issue=... --resolution=... [--outcome=...]
  tag <id> [--add=a,b] [--remove=c,d]
  status <id> <active|resolved|archived>
  fallback <id> <auto-resume|ask|new>
  search "query..." [--limit=N]
  resume <id> ["prompt..."]
  remove|delete <id>
`);
  }
  } catch (e) {
    err(e && e.message ? e.message : String(e));
    process.exit(1);
  }
}

function readAllStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(""); return; }
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { buf += chunk; });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(buf));
  });
}

function extractFromHookPayload(payload) {
  // Claude Code PostToolUse hook stdin schema (best-effort):
  //   { session_id, tool_name, tool_input, tool_response, ... }
  const toolName = payload.tool_name || payload.toolName || "mcp__codex__codex";
  const input = payload.tool_input || payload.toolInput || {};
  let response = payload.tool_response || payload.toolResponse || {};
  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response);
      if (parsed && typeof parsed === "object") response = parsed;
    } catch {}
  }
  const durationMs = Number(payload.duration_ms ?? payload.durationMs);
  const promptText = typeof input.prompt === "string" ? input.prompt : "";

  // tool_response content can be a string or a structured array
  let responseText = "";
  if (typeof response === "string") responseText = response;
  else if (typeof response.content === "string") responseText = response.content;
  else if (Array.isArray(response.content)) {
    responseText = response.content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
  } else if (response.threadId && response.content) {
    responseText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  } else if (response && typeof response === "object") {
    responseText = JSON.stringify(response) || "";
  }

  // threadId discovery
  let threadId = response.threadId || response.thread_id || null;
  if (!threadId) {
    const blob = JSON.stringify(response);
    const m = blob.match(/"thread[_-]?[Ii]d"\s*:\s*"([^"]+)"/);
    if (m) threadId = m[1];
  }

  const sandbox = input.sandbox || null;
  const approval = input["approval-policy"] || input.approvalPolicy || null;
  const outcome = response.isError ? "tool-error" : "ok";
  const errorKind = (responseText && /session not found/i.test(responseText)) ? "session-not-found" : null;

  return {
    skill: "auto-hook",
    tool: toolName,
    sandbox,
    approvalPolicy: approval,
    threadId,
    promptChars: promptText.length,
    responseChars: responseText.length,
    elapsedMs: Number.isFinite(durationMs) ? durationMs : 0,
    viaAgent: false,
    outcome: errorKind || outcome,
    errorKind,
    notes: null,
  };
}

async function shouldAcceptAutoHookLog() {
  try {
    const state = await readJson(STATE_FILE);
    const improvementLoop = state?.choices?.improvementLoop;
    return improvementLoop === "auto-on-skill" || improvementLoop === "periodic";
  } catch {
    return true;
  }
}

// G3 fix: every log entry now carries the active usageMode so analyzer rules
// (notably ruleUsageModeDrift) can correlate calls to the mode in effect at log time.
// Fails open: missing/corrupt config returns null rather than throwing.
async function readUsageModeSafe() {
  try {
    const state = await readJson(STATE_FILE);
    return state?.choices?.usageMode || null;
  } catch {
    return null;
  }
}

function isFromStdin(args) {
  return args.flags["from-stdin"] === true || args.flags["from-stdin"] === "true";
}

// v0.5.0: PreToolUse gate handler — invoked by `codex-on-claude gate --from-stdin`.
// Reads the hook payload from stdin, consults config.usageMode, and emits a Claude Code
// hook decision JSON (`{decision, reason}`) when the call should be blocked.
//
// L6.2 fix (fail-CLOSED for Codex-shaped tools):
//   The original handler returned silently on parse failure or missing config — which produced
//   `decision=allow` exactly when defense matters most (corrupt state, symlinked config). Now:
//     - If we can identify the tool as Codex-shaped (MCP variant OR Bash invoking codex CLI) but
//       state is unreadable, emit `deny` with reason "state unreadable, failing closed".
//     - For unidentifiable / non-Codex tools we still fail-open (avoid breaking unrelated calls).
// H1 fix: emit Claude Code hook decision in BOTH the legacy `{decision, reason}` shape and the
// newer `hookSpecificOutput.permissionDecision` shape so we work against current (2.1.x) and any
// future Claude Code that drops legacy support.
//
// B3 fix (pre-ship audit): the previous version called `process.exit(2)` immediately after
// `process.stdout.write()`. Node's stdout is async for non-TTY streams, so the JSON could be
// truncated before flush — defeating the whole point of the gate. Worse, Claude Code's hook
// contract is "exit 0 + JSON decides"; non-zero exit codes have undefined behavior and may
// cause the host to ignore the JSON entirely.
//
// New strategy: write stderr backstop FIRST (synchronous), then write JSON with a flush
// callback that lets Node exit naturally with code 0 after stdout is drained.
function emitDeny(reason, { hard = false } = {}) {
  // Stderr backstop (synchronous on most platforms): always write to stderr for Codex-shaped
  // hard-denies so even hosts that ignore stdout JSON see the deny intent.
  if (hard) {
    process.stderr.write(`[codex-on-claude gate] DENY: ${reason}\n`);
  }
  const out = {
    // Legacy (current Claude Code 2.1.x reads this)
    decision: "deny",
    reason,
    // New schema (Claude Code 2.2+ may require this)
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  // Write JSON + flush before exit. Honor the "exit 0 + JSON decides" contract.
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function cmdGate(args) {
  const fromStdin = isFromStdin(args);
  if (!fromStdin) {
    process.stdout.write("codex-on-claude gate requires --from-stdin (invoked by Claude Code hook)\n");
    process.exit(2);
  }

  // H2 fix: when --enforce-mode is baked into the hook command line (race-free path),
  // we trust the flag over config.json — eliminates the toggle race between settings.json
  // and config.json writes. If flag is absent we fall back to config-based decision.
  const enforceMode = typeof args.flags["enforce-mode"] === "string" ? args.flags["enforce-mode"] : null;

  const raw = await readAllStdin();
  if (!raw.trim()) return; // no payload → cannot identify tool → allow silently (legacy behavior)

  let payload = null;
  let parseError = null;
  try { payload = JSON.parse(raw); } catch (e) { parseError = e; }

  // Quick pre-screen: regardless of parse result, peek at the raw stdin for Codex hints.
  // If the payload looks Codex-shaped at all, we want to be defensive.
  const looksCodex = /mcp__codex__|"\s*Bash\s*"[\s\S]*codex/i.test(raw);

  if (parseError) {
    if (looksCodex) {
      emitDeny("codex-on-claude gate: payload is malformed JSON and tool appears codex-shaped — failing closed.", { hard: true });
    }
    return; // non-codex unparseable payload → allow
  }

  // If flag is baked in, synthesize a minimal config so decideGate sees the enforce mode.
  // This is race-free: the mode is fixed at install time, not read from a separate file.
  let config = null;
  let configError = null;
  if (enforceMode) {
    config = { choices: { usageMode: enforceMode } };
  } else {
    try { config = await readJson(STATE_FILE); } catch (e) { configError = e; }
  }

  // Decide. decideGate handles the Codex MCP + Bash detection.
  const result = hooks.decideGate(payload, config);

  if (result.decision === "deny") {
    emitDeny(result.reason, { hard: true });
    return;
  }

  // Fail-CLOSED: if config read failed AND tool is Codex-shaped, refuse rather than default to synergy.
  // (Only reachable when enforceMode flag isn't baked in.)
  if (configError && result.meta?.source) {
    emitDeny(
      `codex-on-claude gate: config.json unreadable, failing closed for codex-shaped tool (${result.meta.source}). Run \`codex-on-claude reconfigure\` to restore state.`,
      { hard: true }
    );
    return;
  }

  // allow → exit 0 with no output (default behavior is to allow)
}

async function cmdLog(args) {
  const fromStdin = isFromStdin(args);
  if (fromStdin && !(await shouldAcceptAutoHookLog())) return;

  let entry;
  if (fromStdin) {
    const raw = await readAllStdin();
    if (!raw.trim()) {
      // hook fired without payload — skip silently to avoid noisy errors
      return;
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    entry = extractFromHookPayload(payload);
    // Only log calls related to codex tools — guard against stray hook firings
    if (!/^mcp__codex__/.test(entry.tool)) return;
  } else {
    entry = {
      skill: args.flags["skill"] || null,
      tool: args.flags["tool"] || "mcp__codex__codex",
      sandbox: args.flags["sandbox"] || null,
      approvalPolicy: args.flags["approval-policy"] || null,
      threadId: args.flags["thread-id"] || null,
      promptChars: parseInt(args.flags["prompt-chars"], 10) || 0,
      responseChars: parseInt(args.flags["response-chars"], 10) || 0,
      elapsedMs: parseInt(args.flags["elapsed-ms"], 10) || 0,
      viaAgent: args.flags["via-agent"] === true || args.flags["via-agent"] === "true",
      outcome: args.flags["outcome"] || "ok",
      errorKind: args.flags["error-kind"] || null,
      notes: args.flags["notes"] || null,
    };
  }
  // G3 fix: stamp the active usageMode onto every entry (after extraction, before append).
  entry.usageMode = await readUsageModeSafe();
  const file = await appendLog(entry);
  // Hook mode runs silently (Claude Code captures stdout/stderr per spec); manual mode prints success.
  if (!fromStdin) {
    ok(`Log recorded: ${file}`);
  }
}

async function cmdUninstall(manifest) {
  // B5 fix (pre-ship): always reconcile against actual settings.json regardless of state.
  //   Original behavior gated PostToolUse/PreToolUse hook removal on `state.installed.{hooks,gateHooks}`.
  //   If state was missing/corrupt OR a user manually edited `~/.claude/settings.json`, stale
  //   hook entries (especially the `--enforce-mode=none` PreToolUse gate) could survive uninstall
  //   and keep blocking Codex forever. We now ALWAYS check actual settings.json status.
  const state = await loadState();
  const removed = [];

  // A1 fix (final pre-ship): iterate `installed.agents[]` (v0.4.1+ array form) so the fallback
  // reviewer agent (`codex-reviewer-fallback.md`) is also removed. Backward-compat: also honor
  // the legacy singular `installed.agent` field. When state is missing, fall back to
  // best-effort cleanup against every target known in the manifest.
  const allAgentDefs = [];
  if (manifest.agent) allAgentDefs.push(manifest.agent);
  if (manifest.agentFallback) allAgentDefs.push(manifest.agentFallback);

  if (!state) {
    info("No install-state file — attempting best-effort cleanup against ~/.claude/skills/, /agents/, and ~/.claude/settings.json.");
    // Best-effort: remove every manifest-known skill + agent target.
    for (const skillKey of Object.keys(manifest.skills || {})) {
      const def = manifest.skills[skillKey];
      const dst = path.join(CLAUDE_DIR, def.target);
      if (await removeIfExists(dst)) removed.push(`skills/${skillKey} (best-effort)`);
    }
    for (const agentDef of allAgentDefs) {
      const dst = path.join(CLAUDE_DIR, agentDef.target);
      if (await removeIfExists(dst)) removed.push(`agents/${agentDef.name} (best-effort)`);
    }
  } else {
    for (const skillKey of state.installed?.skills || []) {
      const def = manifest.skills[skillKey];
      if (!def) continue;
      const dst = path.join(CLAUDE_DIR, def.target);
      if (await removeIfExists(dst)) removed.push(`skills/${skillKey}`);
    }
    // A1: iterate `installed.agents[]` (v0.4.1+) or fall back to legacy `installed.agent`.
    const agentNames = state.installed?.agents
      || (state.installed?.agent ? [state.installed.agent] : []);
    for (const agentName of agentNames) {
      // Find target by matching name against manifest entries (handles both primary + fallback).
      const agentDef = allAgentDefs.find((d) => d.name === agentName);
      if (!agentDef) {
        warn(`Cannot locate manifest entry for agent "${agentName}" — skipping removal.`);
        continue;
      }
      const dst = path.join(CLAUDE_DIR, agentDef.target);
      if (await removeIfExists(dst)) removed.push(`agents/${agentName}`);
    }
    if (state.installed?.pluginBundle) {
      warn(`Legacy plugin bundle present (${state.installed.pluginBundle}) — not auto-removed. Manual: rm -rf "$HOME/.claude/${state.installed.pluginBundle}"`);
    }
  }

  // Always check actual PostToolUse hook status — strip ANY entries with our auto-log marker.
  try {
    const postStatus = await hooks.status();
    if (postStatus.present > 0) {
      const r = await hooks.remove();
      if (r.removedGroups) removed.push(`hooks/PostToolUse (${r.removedGroups})`);
    }
  } catch (e) {
    warn(`Error checking/removing PostToolUse hook: ${e.message}`);
  }

  // Always check actual PreToolUse gate status — strip ANY entries with our usage-gate marker.
  // This protects against state drift: e.g. state says gateHooks=false but settings.json still
  // has stale --enforce-mode=none entries from a prior install.
  try {
    const gateStatus = await hooks.gateStatus();
    if (gateStatus.present > 0) {
      const r = await hooks.removeGate();
      if (r.removedGroups) removed.push(`hooks/PreToolUse-gate (${r.removedGroups})`);
    }
  } catch (e) {
    warn(`Error checking/removing PreToolUse gate: ${e.message}`);
  }

  await removeIfExists(STATE_FILE);
  await removeIfExists(STATE_DIR);
  ok(`Removed: ${removed.length} item(s)`);
  removed.forEach((r) => info(`  - ${r}`));
  const mcpServers = getMcpServers(manifest);
  for (const s of mcpServers) {
    warn(`MCP server registration (${s.name}) must be removed manually: \`claude mcp remove ${s.name} -s user\``);
  }
}

async function cmdInstallOrReconfigure(manifest, args, opts = {}) {
  const isReconfigure = opts.reconfigure === true;
  // G2 fix: distinguish explicit user-initiated reconfigure (`coc reconfigure ...`) from
  // auto-detected reconfigure (no-arg invocation with prior state present). The §7 usage-mode
  // prompt should fire only for the explicit case; auto-detected runs silently fill `synergy`
  // and surface the info line.
  const isExplicitReconfigure = opts.explicitReconfigure === true;
  const previousState = await loadState();

  if (isReconfigure && !previousState) {
    info("No prior install state found. Proceeding as a fresh install.");
  }

  // Version-aware banner — make "update + reconfigure" obvious when prior state exists.
  if (previousState?.choices) {
    const vPrev = previousState.version || "?";
    const vCurr = manifest.version;
    const versionLine = vPrev === vCurr
      ? `${c.cyan}v${vCurr}${c.reset} ${c.dim}(same version)${c.reset}`
      : `${c.dim}v${vPrev}${c.reset} ${c.bold}→${c.reset} ${c.cyan}v${vCurr}${c.reset}`;
    log(`\n${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    log(` ${c.bold}Existing install detected.${c.reset}`);
    log(`   codex-on-claude  ${versionLine}`);
    log(`   ${c.dim}Running update + reconfigure — previous answers are kept${c.reset}`);
    log(`   ${c.dim}as defaults. Enter to keep · ↑/↓/Space to change.${c.reset}`);
    log(`${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  }

  // Defaults — normalize aliased keys from previous-state configs (e.g. on-demand → manual)
  const priorSubClaude = previousState?.choices?.subscription?.claude || defaultSubscription("claude");
  const priorSubCodex = previousState?.choices?.subscription?.codex || defaultSubscription("codex");
  // v0.5.0: usageMode migration — silently fill 'synergy' for upgrading users so existing
  // behavior is preserved. Explicit reconfigure surfaces the prompt; otherwise it stays hidden.
  const hadPriorUsageMode = previousState?.choices && Object.prototype.hasOwnProperty.call(previousState.choices, "usageMode");
  const priorUsageMode = previousState?.choices?.usageMode || "synergy";
  const priorAutoTier2 = previousState?.choices?.autoTier2LLMProbe !== false; // default true
  const defaults = {
    patterns: previousState?.choices?.patterns || [],
    contextPolicy: previousState?.choices?.contextPolicy,
    improvementLoop: normalizeImprovementLoop(manifest, previousState?.choices?.improvementLoop),
    threads: previousState?.choices?.threads,
    subscription: { claude: priorSubClaude, codex: priorSubCodex },
    model: {
      codex: {
        primary: clampToTier(manifest, "codex", priorSubCodex,
          previousState?.choices?.model?.codex?.primary || defaultPrimaryFor(manifest, "codex", priorSubCodex)),
        fallback: fallbackFor(manifest, "codex", priorSubCodex),
      },
      reviewer: {
        primary: clampToTier(manifest, "claude", priorSubClaude,
          previousState?.choices?.model?.reviewer?.primary || defaultPrimaryFor(manifest, "claude", priorSubClaude)),
        fallback: fallbackFor(manifest, "claude", priorSubClaude),
      },
    },
    usageMode: priorUsageMode,
    autoTier2LLMProbe: priorAutoTier2,
    guardrails: previousState?.choices?.guardrails || {
      chainJsonTrap: "hard-block",
      subagentStrict: "hard-block",
      turnBurn: "3-turn-stop",
      ceilingNoUpside: "warn-and-skip",
    },
    // v0.5.1: explicit on/off opt-in for the 3-head consensus mode.
    // Default 'off' on upgrade-from-pre-0.5.1 (silent), 'off' as the wizard default for new installs
    // — Cerberus is a heavier feature, opt-in is the right ergonomic.
    cerberus: previousState?.choices?.cerberus || "off",
  };
  if (previousState?.choices?.improvementLoop && previousState.choices.improvementLoop !== defaults.improvementLoop) {
    info(`improvementLoop alias migrated: "${previousState.choices.improvementLoop}" → "${defaults.improvementLoop}"`);
  }

  // Flag overrides
  const flagPatterns = parseListFlag(args.flags["patterns"]);
  const flagCtx = args.flags["context-policy"];
  const flagLoop = args.flags["improvement-loop"];
  const flagThreads = args.flags["threads"];
  const flagSubClaude = typeof args.flags["subscription-claude"] === "string" ? args.flags["subscription-claude"] : null;
  const flagSubCodex = typeof args.flags["subscription-codex"] === "string" ? args.flags["subscription-codex"] : null;
  const flagCodexModelP = typeof args.flags["codex-model-primary"] === "string" ? args.flags["codex-model-primary"] : null;
  const flagCodexReasoningP = typeof args.flags["codex-reasoning-primary"] === "string" ? args.flags["codex-reasoning-primary"] : null;
  const flagReviewerModelP = typeof args.flags["reviewer-model-primary"] === "string" ? args.flags["reviewer-model-primary"] : null;
  const flagReviewerReasoningP = typeof args.flags["reviewer-reasoning-primary"] === "string" ? args.flags["reviewer-reasoning-primary"] : null;
  // Fallback flags are accepted (matrix-locked) — if user passes them and the value doesn't match the matrix base, we warn.
  const flagCodexModelF = typeof args.flags["codex-model-fallback"] === "string" ? args.flags["codex-model-fallback"] : null;
  const flagCodexReasoningF = typeof args.flags["codex-reasoning-fallback"] === "string" ? args.flags["codex-reasoning-fallback"] : null;
  const flagReviewerModelF = typeof args.flags["reviewer-model-fallback"] === "string" ? args.flags["reviewer-model-fallback"] : null;
  const flagReviewerReasoningF = typeof args.flags["reviewer-reasoning-fallback"] === "string" ? args.flags["reviewer-reasoning-fallback"] : null;
  // v0.5.0: usage-mode + auto-tier2-llm-probe flags
  const flagUsageMode = typeof args.flags["usage-mode"] === "string" ? args.flags["usage-mode"] : null;
  const flagAutoTier2 = args.flags["auto-tier2-llm-probe"]; // may be true, false, "on", "off", or undefined
  const flagCerberus = args.flags["cerberus"]; // may be true|"on"|"off"|undefined — explicit opt-in flag
  const autoYes = args.flags["yes"] === true || args.flags["y"] === true;
  if (args.flags["share-scope"] !== undefined) {
    warn(`--share-scope=${args.flags["share-scope"]} is deprecated and ignored since v0.3.`);
  }

  // Preflight: verify Claude Code + Codex CLI presence
  await preflight({ autoYes });

  // MCP check
  log(`\n${c.bold}1. MCP server check${c.reset}`);
  const mcpStatus = await checkMcp(manifest);
  // v0.5.1: any server missing → offer registration. offerMcpRegister skips already-registered.
  const anyMissing = mcpStatus.servers && mcpStatus.servers.some((s) => s.state === "missing");
  if (mcpStatus.state === "missing" || anyMissing) {
    await offerMcpRegister(manifest, autoYes);
  }

  // Questions
  log(`\n${c.bold}2. Install options${c.reset}`);
  const hasPrev = !!previousState?.choices;
  if (hasPrev && isInteractive() && !autoYes) {
    log(`${c.bold}Current selections${c.reset} ${c.dim}(walk through each — keep with Enter, change with ↑/↓/Space)${c.reset}`);
    log(renderReviewTable(previousState.choices, defaults, false).replace(/← changed/g, "").replace(/\(new\)/g, "(current)"));
    log("");
  } else if (previousState) {
    info(`Using existing config as defaults.${isReconfigure ? " Change only what you need." : ""}`);
  }

  // Draft starts at defaults and is mutated through each question; on "Edit again" we loop with the draft pre-checked.
  let choices = {
    patterns: defaults.patterns || [],
    contextPolicy: defaults.contextPolicy || "mixed",
    improvementLoop: defaults.improvementLoop || "manual",
    threads: defaults.threads || "basic",
    subscription: { ...defaults.subscription },
    model: {
      codex:    { primary: { ...defaults.model.codex.primary },    fallback: { ...defaults.model.codex.fallback } },
      reviewer: { primary: { ...defaults.model.reviewer.primary }, fallback: { ...defaults.model.reviewer.fallback } },
    },
    usageMode: defaults.usageMode || "synergy",
    autoTier2LLMProbe: defaults.autoTier2LLMProbe !== false,
    guardrails: { ...defaults.guardrails },
  };

  // Apply CLI flag overrides up front — they short-circuit prompts entirely.
  if (Array.isArray(flagPatterns)) choices.patterns = flagPatterns;
  if (typeof flagCtx === "string") choices.contextPolicy = flagCtx;
  if (typeof flagThreads === "string") choices.threads = flagThreads;
  if (typeof flagLoop === "string") {
    choices.improvementLoop = normalizeImprovementLoop(manifest, flagLoop);
    if (flagLoop !== choices.improvementLoop) info(`improvementLoop "${flagLoop}" → "${choices.improvementLoop}" (alias)`);
  }
  // v0.5.0: usage-mode flag
  if (flagUsageMode) {
    const allowedModes = manifest.questions.usageMode.choices.map((ch) => ch.key);
    if (!allowedModes.includes(flagUsageMode)) {
      err(`--usage-mode=${flagUsageMode} not in allowed: ${allowedModes.join(", ")}`);
      process.exit(2);
    }
    choices.usageMode = flagUsageMode;
  }
  if (flagAutoTier2 !== undefined) {
    // Accept boolean true/false (--auto-tier2-llm-probe / --auto-tier2-llm-probe=false) or "on"/"off"
    if (flagAutoTier2 === true || flagAutoTier2 === "on" || flagAutoTier2 === "true") choices.autoTier2LLMProbe = true;
    else if (flagAutoTier2 === false || flagAutoTier2 === "off" || flagAutoTier2 === "false") choices.autoTier2LLMProbe = false;
    else {
      err(`--auto-tier2-llm-probe=${flagAutoTier2} invalid (use on|off or omit value)`);
      process.exit(2);
    }
  }
  // v0.5.1: --cerberus=on|off flag — explicit opt-in for the 3-head consensus feature.
  if (flagCerberus !== undefined) {
    if (flagCerberus === true || flagCerberus === "on" || flagCerberus === "true") choices.cerberus = "on";
    else if (flagCerberus === false || flagCerberus === "off" || flagCerberus === "false") choices.cerberus = "off";
    else {
      err(`--cerberus=${flagCerberus} invalid (use on|off or omit value)`);
      process.exit(2);
    }
  }
  // Subscription flags
  if (flagSubClaude) {
    if (!allowedSubscriptions(manifest, "claude").includes(flagSubClaude)) {
      err(`--subscription-claude=${flagSubClaude} not in allowed: ${allowedSubscriptions(manifest, "claude").join(", ")}`);
      process.exit(2);
    }
    choices.subscription.claude = flagSubClaude;
  }
  if (flagSubCodex) {
    if (!allowedSubscriptions(manifest, "codex").includes(flagSubCodex)) {
      err(`--subscription-codex=${flagSubCodex} not in allowed: ${allowedSubscriptions(manifest, "codex").join(", ")}`);
      process.exit(2);
    }
    choices.subscription.codex = flagSubCodex;
  }
  // Primary model/reasoning flags (validated against the (possibly just-updated) subscription).
  if (flagCodexModelP) choices.model.codex.primary.id = flagCodexModelP;
  if (flagCodexReasoningP) choices.model.codex.primary.reasoning = flagCodexReasoningP;
  if (flagReviewerModelP) choices.model.reviewer.primary.id = flagReviewerModelP;
  if (flagReviewerReasoningP) choices.model.reviewer.primary.reasoning = flagReviewerReasoningP;
  // Validate primary now (after both subscription and primary may have come from flags).
  {
    const vC = validateModelChoice(manifest, "codex", choices.subscription.codex, choices.model.codex.primary);
    if (!vC.ok) { err(vC.reason); info(`Hint: tier "${choices.subscription.codex}" base = ${JSON.stringify(fallbackFor(manifest, "codex", choices.subscription.codex))}`); process.exit(2); }
    const vR = validateModelChoice(manifest, "claude", choices.subscription.claude, choices.model.reviewer.primary);
    if (!vR.ok) { err(vR.reason); info(`Hint: tier "${choices.subscription.claude}" base = ${JSON.stringify(fallbackFor(manifest, "claude", choices.subscription.claude))}`); process.exit(2); }
  }
  // Fallback flags are locked to matrix base; warn-and-overwrite if user disagrees.
  const enforceFallback = () => {
    const expectC = fallbackFor(manifest, "codex", choices.subscription.codex);
    const expectR = fallbackFor(manifest, "claude", choices.subscription.claude);
    if (flagCodexModelF && flagCodexModelF !== expectC.id) warn(`--codex-model-fallback=${flagCodexModelF} ignored — locked to base "${expectC.id}" for tier "${choices.subscription.codex}".`);
    if (flagCodexReasoningF && flagCodexReasoningF !== expectC.reasoning) warn(`--codex-reasoning-fallback=${flagCodexReasoningF} ignored — locked to base "${expectC.reasoning}".`);
    if (flagReviewerModelF && flagReviewerModelF !== expectR.id) warn(`--reviewer-model-fallback=${flagReviewerModelF} ignored — locked to base "${expectR.id}" for tier "${choices.subscription.claude}".`);
    if (flagReviewerReasoningF && flagReviewerReasoningF !== expectR.reasoning) warn(`--reviewer-reasoning-fallback=${flagReviewerReasoningF} ignored — locked to base "${expectR.reasoning}".`);
    choices.model.codex.fallback = expectC;
    choices.model.reviewer.fallback = expectR;
  };
  enforceFallback();

  function logChange(key, prev, next, isMulti) {
    if (autoYes) return;
    log(`  ${c.dim}↳ ${key}: ${formatChange(prev, next, isMulti)}${c.reset}`);
  }

  let reviewDecision;
  do {
    reviewDecision = "apply";

    if (!autoYes && !Array.isArray(flagPatterns)) {
      const before = choices.patterns;
      choices.patterns = await askMulti(
        manifest.questions.patterns.label,
        manifest.questions.patterns.choices,
        choices.patterns
      );
      logChange("patterns", before, choices.patterns, true);
    }
    if (!autoYes && typeof flagCtx !== "string") {
      const before = choices.contextPolicy;
      choices.contextPolicy = await askSingle(
        manifest.questions.contextPolicy.label,
        manifest.questions.contextPolicy.choices,
        choices.contextPolicy
      );
      logChange("contextPolicy", before, choices.contextPolicy, false);
    }
    if (!autoYes && typeof flagLoop !== "string") {
      const before = choices.improvementLoop;
      const raw = await askSingle(
        manifest.questions.improvementLoop.label,
        manifest.questions.improvementLoop.choices,
        choices.improvementLoop
      );
      choices.improvementLoop = normalizeImprovementLoop(manifest, raw);
      if (raw !== choices.improvementLoop) info(`improvementLoop "${raw}" → "${choices.improvementLoop}" (alias)`);
      logChange("improvementLoop", before, choices.improvementLoop, false);
    }
    if (!autoYes && typeof flagThreads !== "string") {
      const before = choices.threads;
      choices.threads = await askSingle(
        manifest.questions.threads.label,
        manifest.questions.threads.choices,
        choices.threads
      );
      logChange("threads", before, choices.threads, false);
    }

    // ------- Usage mode (v0.5.0) -------
    // Migration policy: existing users without prior usageMode AND not explicitly reconfiguring
    // skip this prompt (silent default 'synergy'). All other paths surface the prompt.
    // G2 fix: skip §7 prompt when upgrading user has no prior usageMode AND wasn't explicitly
    // reconfiguring. This fires for the canonical `npx codex-on-claude@latest` upgrade path.
    const skipUsageModePrompt = hadPriorUsageMode === false && !isExplicitReconfigure && hasPrev;
    if (!autoYes && !flagUsageMode && !skipUsageModePrompt) {
      const before = choices.usageMode;
      choices.usageMode = await askSingle(
        manifest.questions.usageMode.label,
        manifest.questions.usageMode.choices,
        choices.usageMode
      );
      logChange("usageMode", before, choices.usageMode, false);
    } else if (skipUsageModePrompt) {
      info(`usageMode: silent default "synergy" applied for upgrade (run \`codex-on-claude reconfigure\` to change)`);
    }
    if (!autoYes && flagAutoTier2 === undefined && choices.usageMode === "auto" && !skipUsageModePrompt) {
      const before = choices.autoTier2LLMProbe ? "on" : "off";
      const choice = await askSingle(
        manifest.questions.autoTier2LLMProbe.label,
        manifest.questions.autoTier2LLMProbe.choices,
        before
      );
      choices.autoTier2LLMProbe = choice === "on";
      logChange("autoTier2LLMProbe", before, choice, false);
    }

    // ------- Cerberus opt-in (v0.5.1) -------
    // Explicit on/off question. Migration: existing users on upgrade get the silent default
    // 'off' (same migration pattern as usageMode in 0.5.0), but explicit `reconfigure` always
    // shows the prompt.
    const hadPriorCerberus = previousState?.choices && Object.prototype.hasOwnProperty.call(previousState.choices, "cerberus");
    const skipCerberusPrompt = hadPriorCerberus === false && !isExplicitReconfigure && hasPrev;
    if (!autoYes && flagCerberus === undefined && manifest.questions.cerberus && !skipCerberusPrompt) {
      const before = choices.cerberus;
      choices.cerberus = await askSingle(
        manifest.questions.cerberus.label,
        manifest.questions.cerberus.choices,
        choices.cerberus || "off"
      );
      logChange("cerberus", before, choices.cerberus, false);
    } else if (skipCerberusPrompt) {
      info(`cerberus: silent default "off" applied for upgrade (run \`codex-on-claude reconfigure\` or pass \`--cerberus=on\` to enable)`);
    }

    // ------- Subscription + model + reasoning (v0.4.1) -------
    if (!autoYes && !flagSubClaude) {
      const before = choices.subscription.claude;
      choices.subscription.claude = await askSingle(
        manifest.questions.subscriptionClaude.label,
        manifest.questions.subscriptionClaude.choices,
        choices.subscription.claude
      );
      // If the subscription changed, snap primary back to a valid value for the new tier.
      if (before !== choices.subscription.claude) {
        choices.model.reviewer.primary = clampToTier(manifest, "claude", choices.subscription.claude, choices.model.reviewer.primary);
      }
      logChange("sub:claude", before, choices.subscription.claude, false);
    }
    if (!autoYes && !flagSubCodex) {
      const before = choices.subscription.codex;
      choices.subscription.codex = await askSingle(
        manifest.questions.subscriptionCodex.label,
        manifest.questions.subscriptionCodex.choices,
        choices.subscription.codex
      );
      if (before !== choices.subscription.codex) {
        choices.model.codex.primary = clampToTier(manifest, "codex", choices.subscription.codex, choices.model.codex.primary);
      }
      logChange("sub:codex", before, choices.subscription.codex, false);
    }

    // Helper for dynamic-options ask
    const askModelSlot = async (side, label) => {
      const tier = side === "codex" ? choices.subscription.codex : choices.subscription.claude;
      const t = tierEntry(manifest, side, tier);
      if (!t) return; // already validated
      const slot = side === "codex" ? choices.model.codex.primary : choices.model.reviewer.primary;
      const beforeId = slot.id;
      const beforeR = slot.reasoning;
      const flagModelP = side === "codex" ? flagCodexModelP : flagReviewerModelP;
      const flagReasoningP = side === "codex" ? flagCodexReasoningP : flagReviewerReasoningP;
      if (!flagModelP) {
        slot.id = await askSingle(
          `${label} — primary model`,
          t.models.map((m) => ({ key: m, label: m === t.base.id ? `${m} (base)` : m })),
          slot.id
        );
      }
      if (!flagReasoningP) {
        slot.reasoning = await askSingle(
          `${label} — primary reasoning effort`,
          t.reasoning.map((r) => ({ key: r, label: r === t.base.reasoning ? `${r} (base)` : r })),
          slot.reasoning
        );
      }
      logChange(`${side}-primary`, `${beforeId} · ${beforeR}`, `${slot.id} · ${slot.reasoning}`, false);
    };
    if (!autoYes) {
      await askModelSlot("codex", "Codex");
      await askModelSlot("claude", "Claude reviewer");
    }
    // Re-enforce fallback after any subscription changes during the prompt loop.
    enforceFallback();

    // Review screen — shown for both fresh install and reconfigure
    log(`\n${c.bold}3. Review${c.reset}`);
    log(renderReviewTable(previousState?.choices, choices, hasPrev));
    if (hooksEnabled(manifest, choices.improvementLoop)) {
      log(`${c.dim}  ↳ improvementLoop=${choices.improvementLoop} adds 2 PostToolUse hooks (mcp__codex__codex, mcp__codex__codex-reply) to ~/.claude/settings.json.${c.reset}`);
      log(`${c.dim}    Remove with: codex-on-claude reconfigure --improvement-loop=manual${c.reset}`);
    }

    if (autoYes) break;
    reviewDecision = await askReviewDecision();
    if (reviewDecision === "cancel") {
      warn("Cancelled — no changes applied.");
      return;
    }
  } while (reviewDecision === "edit");

  log(`\n${c.bold}4. Apply${c.reset}`);
  log(`  patterns: ${choices.patterns.join(", ") || "(none)"}`);
  log(`  contextPolicy: ${choices.contextPolicy}`);
  log(`  improvementLoop: ${choices.improvementLoop}`);
  log(`  threads: ${choices.threads}`);
  log(`  usageMode: ${choices.usageMode}${choices.usageMode === "auto" ? `  ${c.dim}(Tier 2 LLM probe: ${choices.autoTier2LLMProbe ? "on" : "off"})${c.reset}` : ""}`);
  log(`  cerberus: ${choices.cerberus || "off"}`);
  log(`  subscription: claude=${choices.subscription.claude}  codex=${choices.subscription.codex}`);
  log(`  codex   : primary ${fmtModelSlot(choices.model.codex.primary)}   ${c.dim}fallback ${fmtModelSlot(choices.model.codex.fallback)} (locked)${c.reset}`);
  log(`  reviewer: primary ${fmtModelSlot(choices.model.reviewer.primary)}   ${c.dim}fallback ${fmtModelSlot(choices.model.reviewer.fallback)} (locked)${c.reset}`);

  const installed = await applyInstallation(manifest, choices, previousState);

  // v0.5.5: seed `choices.cerberusConfig: {}` when cerberus opt-in is ON so users have a
  // visible, edit-ready stub in config.json. Pre-v0.5.5 the field was undocumented and the
  // server's loadConfig() reader pointed at the wrong path (cfg.choices.cerberus = "on"/"off"
  // enum) — fixed in cerberus-server.mjs to consume choices.cerberusConfig instead.
  seedCerberusConfig(choices);

  const newState = {
    version: manifest.version,
    choices,
    installed,
    mcp: { name: mcpStatus.name || (Array.isArray(manifest.mcp) ? manifest.mcp[0]?.name : manifest.mcp?.name) || null, status: mcpStatus.state, servers: mcpStatus.servers || [] },
  };
  await saveState(newState);
  ok(`Saved state to: ${STATE_FILE}`);

  log(`\n${c.bold}5. Next steps${c.reset}`);
  log(`  - Restart Claude Code so the new Skills/Agent are picked up.`);
  log(`  - Check status: ${c.cyan}codex-on-claude status${c.reset}`);
  log(`  - Reconfigure:  ${c.cyan}codex-on-claude reconfigure${c.reset}  ${c.dim}(or just \`npx --yes codex-on-claude@latest\`)${c.reset}`);
  log(`  - Uninstall:    ${c.cyan}codex-on-claude uninstall${c.reset}`);

  const sh = (process.env.SHELL || "").split("/").pop();
  if (sh === "zsh" || sh === "bash") {
    log(`\n  ${c.dim}hint: if \`codex-on-claude\` reports "command not found" right after an upgrade,${c.reset}`);
    log(`  ${c.dim}      run \`hash -r\` in this shell (or open a new terminal) — npm replaced the binary.${c.reset}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const sub = args._[0];

  let manifest;
  try {
    manifest = await readJson(MANIFEST_PATH);
  } catch (e) {
    err(`Failed to load manifest: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  // Drift guard: package.json is the npm-published source of truth. If a release
  // bumps package.json but forgets manifest.json, the installer would otherwise
  // show "(same version)" and write the stale version to state.json — making
  // `npx codex-on-claude@latest` appear to no-op for users upgrading.
  try {
    const pkg = await readJson(PKG_JSON_PATH);
    if (pkg?.version && pkg.version !== manifest.version) {
      warn(`manifest.json version (${manifest.version}) ≠ package.json version (${pkg.version}). Using package.json — this is a release-packaging bug, please report.`);
      manifest.version = pkg.version;
    }
  } catch { /* package.json is optional at runtime; manifest is authoritative if missing */ }

  // Keep automation stdout clean while preserving the interactive banner on stderr.
  console.error(`${c.bold}codex-on-claude${c.reset} v${manifest.version}`);

  // v0.5.1: stdio MCP server entrypoint. `codex-on-claude mcp-server <name>` boots an MCP
  // server over stdio. Currently the only server is "cerberus". Keeping this branch early so
  // the banner above doesn't pollute the JSON-RPC stream (banner goes to stderr, which is fine
  // for stdio MCP — but we still want minimum noise during handshake).
  if (sub === "mcp-server") {
    const serverName = args._[1];
    if (serverName === "cerberus") {
      const mod = await import("./cerberus-server.mjs");
      await mod.runCerberusServer();
      return;
    }
    err(`Unknown MCP server: "${serverName || "(none)"}". Available: cerberus`);
    process.exit(2);
  }

  if (sub === "status") {
    await cmdStatus();
    return;
  }
  if (sub === "doctor" || sub === "check") {
    await preflight({ autoYes: false });
    return;
  }
  if (sub === "uninstall" || sub === "remove") {
    await cmdUninstall(manifest);
    return;
  }
  if (sub === "reconfigure" || sub === "config") {
    await cmdInstallOrReconfigure(manifest, args, { reconfigure: true, explicitReconfigure: true });
    return;
  }
  if (sub === "analyze") {
    await cmdAnalyze(args);
    return;
  }
  if (sub === "suggest") {
    await cmdSuggest(args);
    return;
  }
  if (sub === "log") {
    await cmdLog(args);
    return;
  }
  if (sub === "gate") {
    await cmdGate(args);
    return;
  }
  if (sub === "threads") {
    await cmdThreads(args);
    return;
  }
  if (sub === "help" || args.flags.help) {
    log(`Usage:
  codex-on-claude               Install or reconfigure (auto-detects existing state; preflight included)
  codex-on-claude reconfigure   Explicit reconfigure (same as no-arg when state exists)
  codex-on-claude doctor        Run preflight only (Node/codex/claude/MCP checks)
  codex-on-claude status        Show install state
  codex-on-claude uninstall     Remove installed components
  codex-on-claude analyze       Analyze usage log and surface improvement candidates
  codex-on-claude suggest       Record an apply/reject decision for a candidate
  codex-on-claude log           Append a usage log entry manually
  codex-on-claude threads ...   Persistent thread catalog (list/show/new/note/resume…)

Install flags:
  --patterns=review,followup,fix,routine
  --context-policy=direct|summarize|mixed
  --improvement-loop=off|manual|auto-on-skill|periodic   (alias: on-demand → manual)
  --threads=off|basic|full
  --usage-mode=none|synergy|auto|max                     (v0.5.0 — Codex invocation policy)
  --auto-tier2-llm-probe=on|off                          (v0.5.0 — auto-mode Tier 2 LLM probe)
  --cerberus=on|off                                      (v0.5.1 — 3-head planning consensus opt-in)
  --subscription-claude=free|pro|max|team|enterprise
  --subscription-codex=free|plus|pro|team
  --codex-model-primary=<id>    --codex-reasoning-primary=<level>
  --reviewer-model-primary=<id> --reviewer-reasoning-primary=<level>
  --yes, -y                     Auto-accept all confirmations (skips review screen)
  --share-scope=...             (deprecated, ignored — removed in v0.3)

Analyze flags:
  --days=14                     Window in days (default 14)
  --format=text|json|markdown
  --save                        Save the report under ~/.claude/codex-on-claude/reports/

Suggest flags:
  --apply=N                     Record applied for candidate N
  --reject=N --reason="..."     Record rejected for candidate N

Log flags (all optional):
  --from-stdin                  Auto-extract from Claude Code PostToolUse hook JSON on stdin
  --skill=codex-review --tool=mcp__codex__codex --sandbox=read-only
  --thread-id=... --prompt-chars=N --response-chars=N --elapsed-ms=N
  --via-agent=true --outcome=ok|session-not-found|tool-error|timeout
  --error-kind=... --notes="..."

Threads subcommand:
  threads list [--status=...] [--tag=...] [--since=7d] [--skill=...]
  threads show <id>
  threads new <id> [--title="..."] [--tags=a,b] [--skill=...] [--cwd=...] [--sandbox=read-only] [--files=a,b] [--fallback=auto-resume|ask|new]
  threads goal|outcome|decision|note <id> "text..."
  threads incident <id> --issue=... --resolution=... [--outcome=...]
  threads tag <id> [--add=a,b] [--remove=c,d]
  threads status <id> <active|resolved|archived>
  threads fallback <id> <auto-resume|ask|new>
  threads search "query..."
  threads resume <id> ["prompt..."]
  threads remove <id>

Examples:
  npx --yes codex-on-claude@latest      # canonical: update + auto-reconfigure if state exists
  codex-on-claude --patterns=review,followup --context-policy=mixed --improvement-loop=on-demand --threads=basic --yes
  codex-on-claude analyze --days=7 --format=markdown --save
  codex-on-claude suggest --apply=2
  codex-on-claude threads new 019e1234-... --title="Review PR #42" --tags=review,react --skill=codex-review --cwd="$PWD"
  codex-on-claude threads outcome 019e1234-... "Codex flagged 3 prop inconsistencies"
  codex-on-claude threads resume 019e1234-... "Continue from prior context"
`);
    return;
  }

  // G1 fix: reject unknown positional args before falling through to install.
  // Catches the `--usage-mode max` (space-separated) bug where parseArgs interprets it as
  // `flags["usage-mode"]=true` + positional `max`, silently dropping the user-intended value.
  const KNOWN_SUBCOMMANDS = new Set([
    "reconfigure", "config", "status", "doctor", "check", "uninstall", "remove",
    "analyze", "suggest", "log", "gate", "threads", "help", "mcp-server",
  ]);
  if (sub && !KNOWN_SUBCOMMANDS.has(sub)) {
    err(`Unknown command or positional argument: "${sub}"`);
    info(`If you meant to pass a flag value, use \`=\`. Example: \`--usage-mode=${sub}\` (not \`--usage-mode ${sub}\`).`);
    info(`Run \`codex-on-claude help\` to see available sub-commands and flags.`);
    process.exit(2);
  }

  // No subcommand: auto-detect existing install. With prior state, run the reconfigure path
  // so the user sees a clear "update + reconfigure" banner and the same flow as `reconfigure`.
  // G2 fix: this is the AUTO-detected reconfigure (npx upgrade), NOT explicit — so the §7
  // usage-mode prompt is skipped and the silent-fill info line fires for migrating users.
  const existing = await loadState();
  await cmdInstallOrReconfigure(manifest, args, {
    reconfigure: !!existing?.choices,
    explicitReconfigure: false,
  });
}

main().catch((e) => {
  err(e?.stack || String(e));
  process.exit(1);
});
