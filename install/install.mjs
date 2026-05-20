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
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n");
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

async function checkMcp(manifest) {
  if (!which("claude")) {
    warn("Claude Code CLI (claude) not on PATH. Skipping MCP auto-registration.");
    return { state: "missing-cli" };
  }
  const r = await run("claude", ["mcp", "get", manifest.mcp.name]);
  const combined = (r.stdout + r.stderr).toLowerCase();
  if (r.code === 0 && combined.includes("connected")) {
    ok(`MCP server "${manifest.mcp.name}" already registered and connected`);
    return { state: "connected" };
  }
  if (r.code === 0) {
    warn(`MCP server "${manifest.mcp.name}" registered but connection status unclear.`);
    return { state: "registered-but-unhealthy" };
  }
  info(`MCP server "${manifest.mcp.name}" not registered — registration command: ${manifest.mcp.registerCommand}`);
  return { state: "missing" };
}

async function offerMcpRegister(manifest, autoYes) {
  if (!which("claude")) return;
  const register = autoYes ? true : await askConfirm(`Register MCP server "${manifest.mcp.name}" now?`, true);
  if (!register) {
    info("Skipping MCP registration.");
    return;
  }
  const r = await run("claude", ["mcp", "add", "--scope", "user", manifest.mcp.name, "--", manifest.mcp.command, ...manifest.mcp.args]);
  if (r.code === 0) {
    ok(`MCP server registered.`);
  } else {
    err(`MCP registration failed: ${r.stderr || r.stdout}`);
  }
}

function selectedSkills(manifest, patterns, improvementLoop, threadsMode) {
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
  return [...set];
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
  };
}

async function applyInstallation(manifest, choices, previousState) {
  const desiredSkills = new Set(selectedSkills(manifest, choices.patterns, choices.improvementLoop, choices.threads));
  const desiredAgent = shouldInstallAgent(manifest, choices.contextPolicy);
  const desiredLogging = loggingEnabled(manifest, choices.improvementLoop);
  const desiredThreads = threadsEnabled(manifest, choices.threads);
  const templateVars = buildModelVars({ choices });

  if (desiredLogging) {
    await fs.mkdir(path.join(STATE_DIR, "logs"), { recursive: true });
    await fs.mkdir(path.join(STATE_DIR, "reports"), { recursive: true });
    await fs.mkdir(path.join(STATE_DIR, "improvements"), { recursive: true });
  }
  if (desiredThreads) {
    await fs.mkdir(path.join(STATE_DIR, "threads"), { recursive: true });
  }

  const installed = { skills: [], agent: null, removed: [] };

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

  // Agent install / removal — render both primary and fallback variants when desired.
  const agentDefs = [
    { def: manifest.agent, slot: "primary" },
    ...(manifest.agentFallback ? [{ def: manifest.agentFallback, slot: "fallback" }] : []),
  ];
  installed.agents = [];
  for (const { def, slot } of agentDefs) {
    const target = path.join(CLAUDE_DIR, def.target);
    if (desiredAgent) {
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
  // Backward-compat single-agent field (older state schema readers depend on it).
  installed.agent = installed.agents[0] || null;

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

function isFromStdin(args) {
  return args.flags["from-stdin"] === true || args.flags["from-stdin"] === "true";
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
  const file = await appendLog(entry);
  // Hook mode runs silently (Claude Code captures stdout/stderr per spec); manual mode prints success.
  if (!fromStdin) {
    ok(`Log recorded: ${file}`);
  }
}

async function cmdUninstall(manifest) {
  const state = await loadState();
  if (!state) {
    info("No install-state file. Inspect ~/.claude/skills/codex-* and ~/.claude/agents/codex-reviewer.md manually.");
    return;
  }
  const removed = [];
  for (const skillKey of state.installed?.skills || []) {
    const def = manifest.skills[skillKey];
    if (!def) continue;
    const dst = path.join(CLAUDE_DIR, def.target);
    if (await removeIfExists(dst)) removed.push(`skills/${skillKey}`);
  }
  if (state.installed?.agent) {
    const dst = path.join(CLAUDE_DIR, manifest.agent.target);
    if (await removeIfExists(dst)) removed.push(`agents/${manifest.agent.name}`);
  }
  if (state.installed?.pluginBundle) {
    // v0.3+: do not auto-delete the legacy plugin bundle. Notify instead.
    warn(`Legacy plugin bundle present (${state.installed.pluginBundle}) — not auto-removed. Manual: rm -rf "$HOME/.claude/${state.installed.pluginBundle}"`);
  }
  if (state.installed?.hooks) {
    try {
      const r = await hooks.remove();
      if (r.removedGroups) {
        removed.push(`hooks/PostToolUse (${r.removedGroups})`);
      }
    } catch (e) {
      warn(`Error removing PostToolUse hook: ${e.message}`);
    }
  }
  await removeIfExists(STATE_FILE);
  await removeIfExists(STATE_DIR);
  ok(`Removed: ${removed.length} item(s)`);
  removed.forEach((r) => info(`  - ${r}`));
  warn("MCP server registration (codex) must be removed manually: `claude mcp remove codex -s user`");
}

async function cmdInstallOrReconfigure(manifest, args, opts = {}) {
  const isReconfigure = opts.reconfigure === true;
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
  const autoYes = args.flags["yes"] === true || args.flags["y"] === true;
  if (args.flags["share-scope"] !== undefined) {
    warn(`--share-scope=${args.flags["share-scope"]} is deprecated and ignored since v0.3.`);
  }

  // Preflight: verify Claude Code + Codex CLI presence
  await preflight({ autoYes });

  // MCP check
  log(`\n${c.bold}1. MCP server check${c.reset}`);
  const mcpStatus = await checkMcp(manifest);
  if (mcpStatus.state === "missing") {
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
  };

  // Apply CLI flag overrides up front — they short-circuit prompts entirely.
  if (Array.isArray(flagPatterns)) choices.patterns = flagPatterns;
  if (typeof flagCtx === "string") choices.contextPolicy = flagCtx;
  if (typeof flagThreads === "string") choices.threads = flagThreads;
  if (typeof flagLoop === "string") {
    choices.improvementLoop = normalizeImprovementLoop(manifest, flagLoop);
    if (flagLoop !== choices.improvementLoop) info(`improvementLoop "${flagLoop}" → "${choices.improvementLoop}" (alias)`);
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
  log(`  subscription: claude=${choices.subscription.claude}  codex=${choices.subscription.codex}`);
  log(`  codex   : primary ${fmtModelSlot(choices.model.codex.primary)}   ${c.dim}fallback ${fmtModelSlot(choices.model.codex.fallback)} (locked)${c.reset}`);
  log(`  reviewer: primary ${fmtModelSlot(choices.model.reviewer.primary)}   ${c.dim}fallback ${fmtModelSlot(choices.model.reviewer.fallback)} (locked)${c.reset}`);

  const installed = await applyInstallation(manifest, choices, previousState);

  const newState = {
    version: manifest.version,
    choices,
    installed,
    mcp: { name: manifest.mcp.name, status: mcpStatus.state },
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
    await cmdInstallOrReconfigure(manifest, args, { reconfigure: true });
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

  // No subcommand: auto-detect existing install. With prior state, run the reconfigure path
  // so the user sees a clear "update + reconfigure" banner and the same flow as `reconfigure`.
  const existing = await loadState();
  await cmdInstallOrReconfigure(manifest, args, { reconfigure: !!existing?.choices });
}

main().catch((e) => {
  err(e?.stack || String(e));
  process.exit(1);
});
