// Persistent threadId catalog with work context for codex-on-claude.
// Each Codex thread is stored as ~/.claude/codex-on-claude/threads/<threadId>.json
// plus an index.json for fast lookup. Pure Node, no deps.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const ROOT = path.join(HOME, ".claude", "codex-on-claude");
const DIR = path.join(ROOT, "threads");
const INDEX = path.join(DIR, "index.json");

const VALID_STATUS = new Set(["active", "resolved", "archived"]);
const VALID_FALLBACK = new Set(["auto-resume", "ask", "new"]);
const VALID_SUMMARY_KIND = new Set(["goal", "outcome", "decision", "note"]);

async function pathExists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function ensureDir() { await fs.mkdir(DIR, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function threadFile(threadId) { return path.join(DIR, `${threadId}.json`); }

async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
}
async function writeJson(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n");
}

function isValidThreadId(id) {
  return typeof id === "string" && id.length > 0 && /^[0-9a-zA-Z\-_.]+$/.test(id) && id !== "index";
}

function defaultThread(threadId, opts = {}) {
  return {
    threadId,
    createdAt: nowIso(),
    lastUsedAt: nowIso(),
    title: opts.title || "",
    tags: Array.isArray(opts.tags) ? [...new Set(opts.tags)] : [],
    originatingSkill: opts.originatingSkill || null,
    originatingCwd: opts.originatingCwd || null,
    scope: opts.scope || { files: [], sandbox: null, approvalPolicy: null },
    summaries: [],
    incidents: [],
    fallbackStrategy: opts.fallbackStrategy || "ask",
    status: "active",
    turnCount: 0,
  };
}

async function loadIndex() {
  if (!(await pathExists(INDEX))) return { threads: [] };
  return (await readJson(INDEX)) || { threads: [] };
}

async function saveIndexFromDir() {
  await ensureDir();
  let files;
  try { files = await fs.readdir(DIR); } catch { files = []; }
  const items = [];
  for (const f of files) {
    if (f === "index.json" || !f.endsWith(".json")) continue;
    const t = await readJson(path.join(DIR, f));
    if (!t) continue;
    items.push({
      threadId: t.threadId,
      title: t.title || "",
      tags: t.tags || [],
      status: t.status || "active",
      lastUsedAt: t.lastUsedAt,
      originatingSkill: t.originatingSkill,
      turnCount: t.turnCount || 0,
    });
  }
  items.sort((a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""));
  await writeJson(INDEX, { generatedAt: nowIso(), threads: items });
  return items;
}

export async function createOrUpdate(threadId, opts = {}) {
  if (!isValidThreadId(threadId)) throw new Error(`invalid threadId: ${threadId}`);
  await ensureDir();
  const file = threadFile(threadId);
  let t = await readJson(file);
  if (!t) {
    t = defaultThread(threadId, opts);
  } else {
    if (opts.title !== undefined) t.title = opts.title;
    if (opts.tags) {
      const set = new Set([...(t.tags || []), ...opts.tags]);
      t.tags = [...set];
    }
    if (opts.originatingSkill) t.originatingSkill = opts.originatingSkill;
    if (opts.originatingCwd) t.originatingCwd = opts.originatingCwd;
    if (opts.scope) t.scope = { ...t.scope, ...opts.scope };
    if (opts.fallbackStrategy && VALID_FALLBACK.has(opts.fallbackStrategy)) t.fallbackStrategy = opts.fallbackStrategy;
  }
  t.lastUsedAt = nowIso();
  if (opts.bumpTurn) t.turnCount = (t.turnCount || 0) + 1;
  await writeJson(file, t);
  await saveIndexFromDir();
  return t;
}

export async function get(threadId) {
  if (!isValidThreadId(threadId)) return null;
  return await readJson(threadFile(threadId));
}

export async function latest({ status } = {}) {
  await ensureDir();
  const idx = await loadIndex();
  let items = idx.threads || [];
  if (!items.length) items = await saveIndexFromDir();
  if (status) items = items.filter((t) => t.status === status);
  // index is already sorted by lastUsedAt desc
  return items[0] || null;
}

export async function listAll({ status, tag, since, originatingSkill, limit = 50 } = {}) {
  await ensureDir();
  const idx = await loadIndex();
  let items = idx.threads || [];
  if (!items.length) items = await saveIndexFromDir();
  if (status) items = items.filter((t) => t.status === status);
  if (tag) items = items.filter((t) => (t.tags || []).includes(tag));
  if (originatingSkill) items = items.filter((t) => t.originatingSkill === originatingSkill);
  if (since) {
    let cutoff;
    const m = /^(\d+)([dhm])$/.exec(since);
    if (m) {
      const n = parseInt(m[1], 10);
      const ms = m[2] === "d" ? n * 86400_000 : m[2] === "h" ? n * 3600_000 : n * 60_000;
      cutoff = Date.now() - ms;
    } else {
      cutoff = new Date(since).getTime();
    }
    if (!Number.isNaN(cutoff)) items = items.filter((t) => new Date(t.lastUsedAt || 0).getTime() >= cutoff);
  }
  return items.slice(0, limit);
}

export async function search(query, { limit = 25 } = {}) {
  await ensureDir();
  const idx = await loadIndex();
  const seed = idx.threads.length ? idx.threads : await saveIndexFromDir();
  const q = query.toLowerCase();
  const results = [];
  for (const meta of seed) {
    const t = await readJson(threadFile(meta.threadId));
    if (!t) continue;
    const hay = [
      t.title || "",
      (t.tags || []).join(" "),
      (t.summaries || []).map((s) => `${s.kind}:${s.text}`).join(" "),
      (t.incidents || []).map((i) => `${i.issue} ${i.resolution}`).join(" "),
    ].join(" ").toLowerCase();
    if (hay.includes(q)) {
      results.push({ ...meta, snippet: hay.slice(0, 160) });
      if (results.length >= limit) break;
    }
  }
  return results;
}

export async function addSummary(threadId, kind, text) {
  if (!VALID_SUMMARY_KIND.has(kind)) throw new Error(`invalid summary kind: ${kind}`);
  const t = await get(threadId);
  if (!t) throw new Error(`thread not found: ${threadId}`);
  t.summaries.push({ ts: nowIso(), kind, text: String(text) });
  t.lastUsedAt = nowIso();
  await writeJson(threadFile(threadId), t);
  await saveIndexFromDir();
  return t;
}

export async function addIncident(threadId, { issue, resolution, outcome }) {
  const t = await get(threadId);
  if (!t) throw new Error(`thread not found: ${threadId}`);
  t.incidents.push({
    ts: nowIso(),
    issue: String(issue || ""),
    resolution: String(resolution || ""),
    outcome: outcome ? String(outcome) : null,
  });
  t.lastUsedAt = nowIso();
  await writeJson(threadFile(threadId), t);
  await saveIndexFromDir();
  return t;
}

export async function setTags(threadId, { add = [], remove = [] }) {
  const t = await get(threadId);
  if (!t) throw new Error(`thread not found: ${threadId}`);
  const cur = new Set(t.tags || []);
  for (const a of add) cur.add(a);
  for (const r of remove) cur.delete(r);
  t.tags = [...cur];
  await writeJson(threadFile(threadId), t);
  await saveIndexFromDir();
  return t;
}

export async function setStatus(threadId, status) {
  if (!VALID_STATUS.has(status)) throw new Error(`invalid status: ${status}`);
  const t = await get(threadId);
  if (!t) throw new Error(`thread not found: ${threadId}`);
  t.status = status;
  t.lastUsedAt = nowIso();
  await writeJson(threadFile(threadId), t);
  await saveIndexFromDir();
  return t;
}

export async function setFallback(threadId, strategy) {
  if (!VALID_FALLBACK.has(strategy)) throw new Error(`invalid fallback: ${strategy}`);
  const t = await get(threadId);
  if (!t) throw new Error(`thread not found: ${threadId}`);
  t.fallbackStrategy = strategy;
  await writeJson(threadFile(threadId), t);
  await saveIndexFromDir();
  return t;
}

export async function getFallback(threadId) {
  const t = await get(threadId);
  return t?.fallbackStrategy || "ask";
}

export async function remove(threadId) {
  if (!isValidThreadId(threadId)) return false;
  const file = threadFile(threadId);
  if (await pathExists(file)) {
    await fs.unlink(file);
    await saveIndexFromDir();
    return true;
  }
  return false;
}

export function renderShow(t) {
  if (!t) return "(thread not found)";
  const lines = [];
  lines.push(`Thread: ${t.threadId}`);
  lines.push(`  title:     ${t.title || "(untitled)"}`);
  lines.push(`  status:    ${t.status}`);
  lines.push(`  tags:      ${(t.tags || []).join(", ") || "(none)"}`);
  lines.push(`  created:   ${t.createdAt}`);
  lines.push(`  lastUsed:  ${t.lastUsedAt}`);
  lines.push(`  turns:     ${t.turnCount || 0}`);
  lines.push(`  skill:     ${t.originatingSkill || "(unknown)"}`);
  lines.push(`  cwd:       ${t.originatingCwd || "(unknown)"}`);
  lines.push(`  sandbox:   ${t.scope?.sandbox || "(unknown)"}`);
  lines.push(`  files:     ${(t.scope?.files || []).join(", ") || "(none)"}`);
  lines.push(`  fallback:  ${t.fallbackStrategy}`);
  if (t.summaries?.length) {
    lines.push(`  summaries (${t.summaries.length}):`);
    for (const s of t.summaries) {
      lines.push(`    [${s.kind}] ${s.ts} — ${s.text}`);
    }
  }
  if (t.incidents?.length) {
    lines.push(`  incidents (${t.incidents.length}):`);
    for (const i of t.incidents) {
      lines.push(`    ${i.ts} — ${i.issue}  →  ${i.resolution}  [${i.outcome || "open"}]`);
    }
  }
  return lines.join("\n");
}

export function renderList(items) {
  if (!items.length) return "(no threads)";
  const lines = [];
  lines.push(`threadId                              status    turns  lastUsed              tags                 skill           title`);
  lines.push(`-----------------------------------   --------  -----  --------------------  -------------------  --------------  -----`);
  for (const t of items) {
    const id = (t.threadId || "").padEnd(36);
    const status = (t.status || "").padEnd(8);
    const turns = String(t.turnCount || 0).padStart(5);
    const last = (t.lastUsedAt || "").slice(0, 19).padEnd(20);
    const tags = (t.tags || []).slice(0, 3).join(",").padEnd(19);
    const skill = (t.originatingSkill || "").padEnd(14);
    lines.push(`${id}  ${status}  ${turns}  ${last}  ${tags}  ${skill}  ${t.title || ""}`);
  }
  return lines.join("\n");
}

export const PATHS = { ROOT, DIR, INDEX };
