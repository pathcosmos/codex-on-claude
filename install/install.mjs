#!/usr/bin/env node
// codex-on-claude installer / reconfigurer
// Usage:
//   codex-on-claude              # interactive install (uses saved config if present as defaults)
//   codex-on-claude reconfigure  # interactive re-selection with previous answers as defaults
//   codex-on-claude status       # show current installation state
//   codex-on-claude uninstall    # remove all installed components
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const STATE_DIR = path.join(CLAUDE_DIR, "codex-on-claude");
const STATE_FILE = path.join(STATE_DIR, "config.json");

const MANIFEST_PATH = path.join(__dirname, "manifest.json");

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
    log("\n취소되었습니다 / cancelled.");
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
      instructions: " (↑/↓ 이동, 스페이스 토글, Enter 확정)",
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
  log(`${c.bold}0. 사전 점검 / Preflight${c.reset}`);
  const codexPath = which("codex");
  const claudePath = which("claude");
  let nodeOk = true;
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 18) {
    err(`Node.js ${process.versions.node} — 18.17+ 필요`);
    nodeOk = false;
  } else {
    ok(`Node.js ${process.versions.node}`);
  }

  let hardFail = !nodeOk;

  if (codexPath) {
    const r = await run("codex", ["--version"]);
    const version = (r.stdout || r.stderr).trim().split("\n")[0];
    if (r.code === 0) ok(`Codex CLI: ${codexPath} (${version})`);
    else warn(`Codex CLI 발견(${codexPath})이지만 --version 호출 실패: ${r.stderr}`);
  } else {
    err(`Codex CLI(codex) — PATH에 없음`);
    info(`설치 안내:`);
    info(`  npm i -g @openai/codex`);
    info(`  또는 https://github.com/openai/codex`);
    hardFail = true;
  }

  if (claudePath) {
    const r = await run("claude", ["--version"]);
    const version = (r.stdout || r.stderr).trim().split("\n")[0];
    if (r.code === 0) ok(`Claude Code: ${claudePath} (${version})`);
    else warn(`Claude Code 발견(${claudePath})이지만 --version 호출 실패: ${r.stderr}`);
  } else {
    err(`Claude Code(claude) — PATH에 없음`);
    info(`설치 안내:`);
    info(`  https://docs.claude.com/en/docs/claude-code/quickstart`);
    info(`  또는 https://claude.ai/download`);
    hardFail = true;
  }

  if (hardFail) {
    if (autoYes) {
      err("필수 CLI가 누락된 상태에서 --yes로 진행하지 않습니다. 설치 후 다시 시도하세요.");
      process.exit(2);
    }
    const proceed = await askConfirm("필수 CLI가 누락되었습니다. 그래도 계속할까요?", false);
    if (!proceed) {
      info("설치를 중단합니다. 누락된 CLI를 설치한 뒤 다시 실행하세요.");
      process.exit(2);
    }
    warn("누락 상태에서 계속 진행 — 일부 단계는 실패할 수 있습니다.");
  }

  // Soft health checks (non-blocking)
  if (codexPath) {
    const r = await run("codex", ["doctor", "--summary"]);
    if (r.code === 0 && /\bok\b/i.test(r.stdout)) {
      ok(`codex doctor: 정상`);
    } else {
      warn(`codex doctor: 정상 응답이 아님 — 인증/네트워크 확인 권장`);
      if (r.stdout) info(`  요약: ${r.stdout.split("\n").slice(0, 2).join(" | ")}`);
    }
  }

  if (claudePath) {
    const r = await run("claude", ["auth", "status", "--text"]);
    if (r.code === 0 && /Login method/i.test(r.stdout)) {
      const line = (r.stdout.split("\n").find((l) => /Login method/i.test(l)) || "").trim();
      ok(`Claude 인증: ${line || "정상"}`);
    } else {
      warn(`Claude 인증 상태 불명확 — 필요 시 \`claude auth login --claudeai\` 후 재시도`);
    }
  }

  // codex MCP server registration check — external automation often needs this confirmed up front
  if (claudePath) {
    const r = await run("claude", ["mcp", "get", "codex"]);
    const combined = (r.stdout + r.stderr).toLowerCase();
    if (r.code === 0 && combined.includes("connected")) {
      ok(`codex MCP 서버: ✓ Connected`);
    } else if (r.code === 0) {
      warn(`codex MCP 등록은 보였지만 상태 불명확 — \`claude mcp list\`로 확인`);
    } else {
      warn(`codex MCP 미등록 — 설치 시 자동 등록 시도됩니다. 수동 등록: \`claude mcp add --scope user codex -- codex mcp-server\``);
    }
  }

  return { codexPath, claudePath };
}

async function checkMcp(manifest) {
  if (!which("claude")) {
    warn("Claude Code CLI(claude)가 PATH에 없습니다. MCP 자동 등록은 건너뜁니다.");
    return { state: "missing-cli" };
  }
  const r = await run("claude", ["mcp", "get", manifest.mcp.name]);
  const combined = (r.stdout + r.stderr).toLowerCase();
  if (r.code === 0 && combined.includes("connected")) {
    ok(`MCP server "${manifest.mcp.name}" 이미 등록됨 및 연결 정상`);
    return { state: "connected" };
  }
  if (r.code === 0) {
    warn(`MCP server "${manifest.mcp.name}" 등록은 되어 있으나 연결 상태가 불명확합니다.`);
    return { state: "registered-but-unhealthy" };
  }
  info(`MCP server "${manifest.mcp.name}" 미등록 — 등록 명령: ${manifest.mcp.registerCommand}`);
  return { state: "missing" };
}

async function offerMcpRegister(manifest, autoYes) {
  if (!which("claude")) return;
  const register = autoYes ? true : await askConfirm(`MCP server "${manifest.mcp.name}"를 지금 등록할까요?`, true);
  if (!register) {
    info("MCP 등록을 건너뜁니다.");
    return;
  }
  const r = await run("claude", ["mcp", "add", "--scope", "user", manifest.mcp.name, "--", manifest.mcp.command, ...manifest.mcp.args]);
  if (r.code === 0) {
    ok(`MCP server 등록 완료`);
  } else {
    err(`MCP 등록 실패: ${r.stderr || r.stdout}`);
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

async function applyInstallation(manifest, choices, previousState) {
  const desiredSkills = new Set(selectedSkills(manifest, choices.patterns, choices.improvementLoop, choices.threads));
  const desiredAgent = shouldInstallAgent(manifest, choices.contextPolicy);
  const desiredLogging = loggingEnabled(manifest, choices.improvementLoop);
  const desiredThreads = threadsEnabled(manifest, choices.threads);

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
      warn(`매니페스트에 ${skillKey} 정의가 없습니다.`);
      continue;
    }
    const src = path.join(__dirname, def.source);
    const dst = path.join(CLAUDE_DIR, def.target);
    if (!(await pathExists(src))) {
      err(`소스 누락: ${src}`);
      continue;
    }
    await copyTree(src, dst);
    installed.skills.push(skillKey);
    ok(`Skill 설치/갱신: ${skillKey} → ${dst}`);
  }

  // Remove skills that were previously installed but no longer desired
  for (const prev of previousSkills) {
    if (!desiredSkills.has(prev)) {
      const def = manifest.skills[prev];
      if (!def) continue;
      const dst = path.join(CLAUDE_DIR, def.target);
      if (await removeIfExists(dst)) {
        installed.removed.push(`skills/${prev}`);
        info(`이전 Skill 제거: ${prev}`);
      }
    }
  }

  // Agent install / removal
  const agentDef = manifest.agent;
  const agentTarget = path.join(CLAUDE_DIR, agentDef.target);
  if (desiredAgent) {
    const src = path.join(__dirname, agentDef.source);
    if (!(await pathExists(src))) {
      err(`Agent 소스 누락: ${src}`);
    } else {
      await fs.mkdir(path.dirname(agentTarget), { recursive: true });
      await fs.copyFile(src, agentTarget);
      installed.agent = agentDef.name;
      ok(`Agent 설치/갱신: ${agentDef.name} → ${agentTarget}`);
    }
  } else {
    if (previousState?.installed?.agent) {
      if (await removeIfExists(agentTarget)) {
        installed.removed.push(`agents/${agentDef.name}`);
        info(`이전 Agent 제거: ${agentDef.name}`);
      }
    }
  }

  // Plugin bundle: deprecated in 0.3.0. Existing 0.2.x bundles are left in place — emit one-time hint.
  if (previousState?.installed?.pluginBundle || previousState?.choices?.shareScope === "team") {
    warn(`plugin bundle 자동 관리는 v0.3에서 deprecated 되었습니다. 기존 디렉토리는 그대로 둡니다.`);
    info(`  수동 제거하려면: rm -rf "$HOME/.claude/plugins/marketplaces/codex-bridge"`);
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
      ok(`PostToolUse hooks 등록 (${r.addedGroups}개): ${r.settingsFile}`);
      installed.hooks = true;
    } catch (e) {
      err(`PostToolUse hook 등록 실패: ${e.message}`);
    }
  } else if (previousState?.installed?.hooks) {
    try {
      const r = await hooks.remove();
      info(`PostToolUse hooks 제거 (${r.removedGroups}개)`);
      installed.hooks = false;
    } catch (e) {
      err(`PostToolUse hook 제거 실패: ${e.message}`);
    }
  }

  return installed;
}

async function cmdStatus() {
  const state = await loadState();
  if (!state) {
    info("아직 설치되지 않았습니다. `codex-on-claude` 또는 `codex-on-claude reconfigure`를 실행하세요.");
    return;
  }
  log(`${c.bold}codex-on-claude 설치 상태${c.reset}`);
  log(`  업데이트: ${state.updatedAt || "-"}`);
  log(`  patterns: ${(state.choices.patterns || []).join(", ") || "(none)"}`);
  log(`  contextPolicy: ${state.choices.contextPolicy}`);
  log(`  improvementLoop: ${state.choices.improvementLoop || "(unset)"}`);
  log(`  threads: ${state.choices.threads || "(unset)"}`);
  log(`  설치된 Skills: ${(state.installed?.skills || []).join(", ") || "(none)"}`);
  log(`  설치된 Agent: ${state.installed?.agent || "(none)"}`);
  try {
    const hookStatus = await hooks.status();
    log(`  PostToolUse hooks: ${hookStatus.present ? `${hookStatus.present} (${hookStatus.matchers.join(", ")})` : "(none)"}`);
  } catch { /* settings file missing */ }
  if (state.choices.shareScope || state.installed?.pluginBundle) {
    log(`  ${c.dim}(legacy) shareScope: ${state.choices.shareScope || "-"}, pluginBundle: ${state.installed?.pluginBundle || "-"}  — v0.3에서 관리 종료${c.reset}`);
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
    process.stdout.write("--apply N 또는 --reject N 을 지정하세요. 후보 목록은 `codex-on-claude analyze`로 확인.\n");
    return;
  }
  const idx = parseInt(applyIdx ?? rejectIdx, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= report.candidates.length) {
    err("유효하지 않은 후보 번호입니다.");
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
  ok(`결정 기록: ${decision} [${cand.id}] → ${file}`);
  if (decision === "applied" && cand.applyHint) {
    info(`적용 명령: ${cand.applyHint}`);
    info("위 명령을 직접 실행하거나, /codex-improve Skill을 호출해 안내를 받으세요.");
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
        info(`thread ${tid} fallback=ask — 직접 codex exec resume / mcp__codex__codex-reply 중 선택해 진행`);
        info(`  메타: title="${t.title || ""}" tags=${(t.tags||[]).join(",")} skill=${t.originatingSkill}`);
        info(`  최근 summaries: ${(t.summaries||[]).slice(-3).map((s)=>`[${s.kind}] ${s.text}`).join(" | ") || "(none)"}`);
        return;
      }
      if (strategy === "new") {
        info(`thread ${tid} fallback=new — 같은 cwd/sandbox로 새 mcp__codex__codex 호출 권장`);
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
  latest [--status=...] [--format=id|json]   # 가장 최근 thread (외부 자동화용 deterministic)
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
  const response = payload.tool_response || payload.toolResponse || {};
  const promptText = typeof input.prompt === "string" ? input.prompt : "";

  // tool_response content can be a string or a structured array
  let responseText = "";
  if (typeof response === "string") responseText = response;
  else if (typeof response.content === "string") responseText = response.content;
  else if (Array.isArray(response.content)) {
    responseText = response.content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
  } else if (response.threadId && response.content) {
    responseText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
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
    elapsedMs: 0,
    viaAgent: false,
    outcome: errorKind || outcome,
    errorKind,
    notes: null,
  };
}

async function cmdLog(args) {
  let entry;
  if (args.flags["from-stdin"] === true || args.flags["from-stdin"] === "true") {
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
  if (!(args.flags["from-stdin"] === true || args.flags["from-stdin"] === "true")) {
    ok(`로그 기록: ${file}`);
  }
}

async function cmdUninstall(manifest) {
  const state = await loadState();
  if (!state) {
    info("설치 상태 파일이 없습니다. 수동으로 ~/.claude/skills/codex-* 및 ~/.claude/agents/codex-reviewer.md 를 확인하세요.");
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
    warn(`legacy plugin bundle 발견 (${state.installed.pluginBundle}) — 자동 제거되지 않습니다. 수동: rm -rf "$HOME/.claude/${state.installed.pluginBundle}"`);
  }
  if (state.installed?.hooks) {
    try {
      const r = await hooks.remove();
      if (r.removedGroups) {
        removed.push(`hooks/PostToolUse (${r.removedGroups})`);
      }
    } catch (e) {
      warn(`PostToolUse hook 제거 중 오류: ${e.message}`);
    }
  }
  await removeIfExists(STATE_FILE);
  await removeIfExists(STATE_DIR);
  ok(`제거 완료: ${removed.length}개 항목`);
  removed.forEach((r) => info(`  - ${r}`));
  warn("MCP server 등록(codex)은 수동으로 제거해야 합니다: `claude mcp remove codex -s user`");
}

async function cmdInstallOrReconfigure(manifest, args, opts = {}) {
  const isReconfigure = opts.reconfigure === true;
  const previousState = await loadState();

  if (isReconfigure && !previousState) {
    info("이전 설치 기록이 없습니다. 처음 설치 흐름으로 진행합니다.");
  }

  // Defaults — normalize aliased keys from previous-state configs (e.g. on-demand → manual)
  const defaults = {
    patterns: previousState?.choices?.patterns || [],
    contextPolicy: previousState?.choices?.contextPolicy,
    improvementLoop: normalizeImprovementLoop(manifest, previousState?.choices?.improvementLoop),
    threads: previousState?.choices?.threads,
  };
  if (previousState?.choices?.improvementLoop && previousState.choices.improvementLoop !== defaults.improvementLoop) {
    info(`improvementLoop alias 마이그레이션: "${previousState.choices.improvementLoop}" → "${defaults.improvementLoop}"`);
  }

  // Flag overrides
  const flagPatterns = parseListFlag(args.flags["patterns"]);
  const flagCtx = args.flags["context-policy"];
  const flagLoop = args.flags["improvement-loop"];
  const flagThreads = args.flags["threads"];
  const autoYes = args.flags["yes"] === true || args.flags["y"] === true;
  if (args.flags["share-scope"] !== undefined) {
    warn(`--share-scope=${args.flags["share-scope"]} 는 v0.3에서 deprecated 되어 무시됩니다.`);
  }

  // Preflight: verify Claude Code + Codex CLI presence
  await preflight({ autoYes });

  // MCP check
  log(`\n${c.bold}1. MCP 서버 상태 확인${c.reset}`);
  const mcpStatus = await checkMcp(manifest);
  if (mcpStatus.state === "missing") {
    await offerMcpRegister(manifest, autoYes);
  }

  // Questions
  log(`\n${c.bold}2. 설치 옵션 선택${c.reset}`);
  if (previousState) {
    info(`기존 설정을 기본값으로 사용합니다. ${isReconfigure ? "변경할 항목만 입력하세요." : ""}`);
  }

  const patternsAns = flagPatterns
    ?? (autoYes ? defaults.patterns : await askMulti(
      manifest.questions.patterns.label,
      manifest.questions.patterns.choices,
      defaults.patterns
    ));

  const ctxAns = typeof flagCtx === "string" ? flagCtx
    : (autoYes ? (defaults.contextPolicy || "mixed") : await askSingle(
      manifest.questions.contextPolicy.label,
      manifest.questions.contextPolicy.choices,
      defaults.contextPolicy
    ));

  const loopAnsRaw = typeof flagLoop === "string" ? flagLoop
    : (autoYes ? (defaults.improvementLoop || "manual") : await askSingle(
      manifest.questions.improvementLoop.label,
      manifest.questions.improvementLoop.choices,
      defaults.improvementLoop || "manual"
    ));
  const loopAns = normalizeImprovementLoop(manifest, loopAnsRaw);
  if (loopAnsRaw !== loopAns) info(`improvementLoop "${loopAnsRaw}" → "${loopAns}" (alias)`);

  const threadsAns = typeof flagThreads === "string" ? flagThreads
    : (autoYes ? (defaults.threads || "basic") : await askSingle(
      manifest.questions.threads.label,
      manifest.questions.threads.choices,
      defaults.threads || "basic"
    ));

  const choices = {
    patterns: patternsAns,
    contextPolicy: ctxAns,
    improvementLoop: loopAns,
    threads: threadsAns,
  };

  log(`\n${c.bold}3. 적용${c.reset}`);
  log(`  patterns: ${choices.patterns.join(", ") || "(none)"}`);
  log(`  contextPolicy: ${choices.contextPolicy}`);
  log(`  improvementLoop: ${choices.improvementLoop}`);
  log(`  threads: ${choices.threads}`);

  if (!autoYes) {
    if (hooksEnabled(manifest, choices.improvementLoop)) {
      log(`${c.dim}  ↳ improvementLoop=${choices.improvementLoop} 는 ~/.claude/settings.json에 PostToolUse hook 2개(mcp__codex__codex, mcp__codex__codex-reply)를 추가합니다.${c.reset}`);
      log(`${c.dim}    제거: codex-on-claude reconfigure --improvement-loop=manual${c.reset}`);
    }
    const ok2 = await askConfirm("이 설정으로 적용할까요?", true);
    if (!ok2) {
      warn("취소되었습니다. 변경사항 없음.");
      return;
    }
  }

  const installed = await applyInstallation(manifest, choices, previousState);

  const newState = {
    version: manifest.version,
    choices,
    installed,
    mcp: { name: manifest.mcp.name, status: mcpStatus.state },
  };
  await saveState(newState);
  ok(`상태 저장: ${STATE_FILE}`);

  log(`\n${c.bold}4. 다음 단계${c.reset}`);
  log(`  - Claude Code를 다시 시작하면 새 Skill/Agent가 인식됩니다.`);
  log(`  - 상태 확인: ${c.cyan}codex-on-claude status${c.reset}`);
  log(`  - 옵션 재구성: ${c.cyan}codex-on-claude reconfigure${c.reset}`);
  log(`  - 제거: ${c.cyan}codex-on-claude uninstall${c.reset}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const sub = args._[0];

  let manifest;
  try {
    manifest = await readJson(MANIFEST_PATH);
  } catch (e) {
    err(`매니페스트 로드 실패: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  log(`${c.bold}codex-on-claude${c.reset} v${manifest.version}`);

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
  codex-on-claude               설치 (인터랙티브, 사전 점검 포함)
  codex-on-claude reconfigure   옵션 재선택 (기존 답을 기본값으로)
  codex-on-claude doctor        사전 점검만 단독 실행 (claude/codex/Node 확인)
  codex-on-claude status        설치 상태 표시
  codex-on-claude uninstall     설치된 컴포넌트 제거
  codex-on-claude analyze       사용 로그 분석 및 개선 후보 표시
  codex-on-claude suggest       특정 후보 채택/거부 기록
  codex-on-claude log           수동으로 사용 기록 추가
  codex-on-claude threads ...   영속 thread 카탈로그 관리 (list/show/new/note/resume 등)

Install flags:
  --patterns=review,followup,fix,routine
  --context-policy=direct|summarize|mixed
  --improvement-loop=off|manual|auto-on-skill|periodic   (alias: on-demand → manual)
  --threads=off|basic|full
  --yes, -y                     모든 확인 자동 수락
  --share-scope=...             (deprecated, ignored — v0.3에서 제거)

Analyze flags:
  --days=14                     최근 N일 (기본 14)
  --format=text|json|markdown
  --save                        보고서를 ~/.claude/codex-on-claude/reports/에 저장

Suggest flags:
  --apply=N                     후보 N 채택 기록
  --reject=N --reason="..."     후보 N 거부 기록

Log flags (모두 옵션):
  --from-stdin                  Claude Code PostToolUse hook이 stdin으로 보낸 JSON에서 자동 추출
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
  codex-on-claude --patterns=review,followup --context-policy=mixed --improvement-loop=on-demand --threads=basic --yes
  npx codex-on-claude reconfigure
  codex-on-claude analyze --days=7 --format=markdown --save
  codex-on-claude suggest --apply=2
  codex-on-claude threads new 019e1234-... --title="Review PR #42" --tags=review,react --skill=codex-review --cwd="$PWD"
  codex-on-claude threads outcome 019e1234-... "Codex flagged 3 prop inconsistencies"
  codex-on-claude threads resume 019e1234-... "Continue from prior context"
`);
    return;
  }

  await cmdInstallOrReconfigure(manifest, args, { reconfigure: false });
}

main().catch((e) => {
  err(e?.stack || String(e));
  process.exit(1);
});
