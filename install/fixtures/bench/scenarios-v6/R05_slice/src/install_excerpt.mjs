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