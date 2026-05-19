// Usage log analyzer + improvement suggestion engine for codex-on-claude.
// Pure Node, no deps.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const ROOT = path.join(HOME, ".claude", "codex-on-claude");
const LOG_DIR = path.join(ROOT, "logs");
const REPORT_DIR = path.join(ROOT, "reports");
const IMPR_DIR = path.join(ROOT, "improvements");
const THREADS_DIR = path.join(ROOT, "threads");
const STATE_FILE = path.join(ROOT, "config.json");

async function pathExists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* ignore malformed line */ }
  }
  return out;
}
async function listLogFiles(days) {
  if (!(await pathExists(LOG_DIR))) return [];
  const entries = await fs.readdir(LOG_DIR);
  const today = new Date();
  const limit = new Date(today.getTime() - days * 86400_000);
  return entries
    .filter((e) => e.startsWith("usage-") && e.endsWith(".jsonl"))
    .filter((e) => {
      const m = /^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(e);
      if (!m) return false;
      return new Date(m[1]) >= limit;
    })
    .sort()
    .map((e) => path.join(LOG_DIR, e));
}

async function loadEntries(days) {
  const files = await listLogFiles(days);
  const all = [];
  for (const f of files) {
    try {
      all.push(...(await readJsonl(f)));
    } catch { /* skip unreadable */ }
  }
  return all;
}

async function loadConfig() {
  if (!(await pathExists(STATE_FILE))) return null;
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); } catch { return null; }
}

async function loadRecentImprovements() {
  if (!(await pathExists(IMPR_DIR))) return [];
  const files = (await fs.readdir(IMPR_DIR)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await fs.readFile(path.join(IMPR_DIR, f), "utf8"))); } catch { /* skip */ }
  }
  return out;
}

function summarize(entries) {
  const total = entries.length;
  const ok = entries.filter((e) => e.outcome === "ok").length;
  const failed = total - ok;
  const responses = entries.map((e) => e.responseChars || 0);
  const sorted = [...responses].sort((a, b) => a - b);
  const p = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
  const avg = responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length) : 0;
  const viaAgent = entries.filter((e) => e.viaAgent).length;
  return {
    total, ok, failed, avgResponse: avg,
    p50Response: p(0.5), p95Response: p(0.95),
    viaAgent,
  };
}

// Heuristic rules — each produces 0..n candidates
function ruleLargeResponsesNotAgent(entries) {
  const big = entries.filter((e) => (e.responseChars || 0) >= 5000 && !e.viaAgent);
  if (big.length < 3) return [];
  const sample = big.slice(0, 3).map((e) => `${e.skill || "(?)"} @ ${e.ts}`);
  const totalKB = Math.round(big.reduce((a, e) => a + (e.responseChars || 0), 0) / 1024);
  return [{
    id: "token-efficiency-route-via-agent",
    category: "token-efficiency",
    title: "큰 응답을 격리 Agent로 라우팅",
    finding: `≥5KB 응답 ${big.length}건이 메인 컨텍스트로 직접 들어왔습니다 (누적 ${totalKB}KB).`,
    recommendation: "이 패턴은 codex-reviewer subagent로 전환하세요. contextPolicy=mixed 또는 summarize 권장.",
    applyHint: "codex-on-claude reconfigure --context-policy=mixed --yes",
    examples: sample,
  }];
}

function ruleRepeatedPrompts(entries) {
  const counts = new Map();
  for (const e of entries) {
    const key = `${e.skill || "(none)"}|${Math.floor((e.promptChars || 0) / 100)}|${e.sandbox || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1]);
  if (!top.length) return [];
  return top.slice(0, 2).map(([key, n], i) => ({
    id: `routine-candidate-${i}`,
    category: "new-skill-or-routine",
    title: "반복 패턴 → routine/Skill 후보",
    finding: `유사한 호출 패턴(${key})이 ${n}회 반복되었습니다.`,
    recommendation: "이 패턴을 /codex-routine으로 등록해 매번 옵션/지시문 입력을 줄이세요.",
    applyHint: "/codex-routine <name>",
  }));
}

function ruleSandboxMismatch(entries) {
  const writeButShortResp = entries.filter((e) => e.sandbox === "workspace-write" && (e.responseChars || 0) < 500);
  if (writeButShortResp.length < 3) return [];
  return [{
    id: "sandbox-downgrade",
    category: "sandbox-safety",
    title: "workspace-write 호출이 실제 수정 없이 끝남",
    finding: `workspace-write 호출 ${writeButShortResp.length}건의 응답이 0.5KB 미만 — 실제 수정이 일어나지 않은 것으로 보입니다.`,
    recommendation: "동일 패턴을 read-only로 다운그레이드해 안전성을 높이세요. 필요 시 별도 /codex-fix 호출.",
  }];
}

function ruleSessionNotFound(entries) {
  const fails = entries.filter((e) => e.errorKind === "session-not-found" || e.outcome === "session-not-found");
  if (fails.length < 2) return [];
  return [{
    id: "resume-fallback",
    category: "reliability",
    title: "Session-not-found 빈도가 높음 — codex-resume 자동화",
    finding: `${fails.length}건의 session-not-found가 발생했습니다.`,
    recommendation: "/codex-resume Skill을 설치하고, /codex-followup 실패 시 자동 전환하도록 하세요.",
    applyHint: "codex-on-claude reconfigure --patterns=followup,... --yes",
  }];
}

function ruleTimeouts(entries) {
  const t = entries.filter((e) => e.outcome === "timeout");
  if (t.length < 2) return [];
  return [{
    id: "timeout-tuning",
    category: "performance",
    title: "timeout 발생 — prompt 단축 또는 모델 조정",
    finding: `${t.length}건의 timeout이 발생했습니다.`,
    recommendation: "prompt를 좁히거나, Codex model 변경(예: gpt-5.5 → 더 빠른 모델)을 고려하세요.",
  }];
}

function ruleNoLogs(entries) {
  if (entries.length > 0) return [];
  return [{
    id: "no-data",
    category: "meta",
    title: "분석 가능한 로그가 없습니다",
    finding: "최근 N일 동안 사용 로그가 비어 있습니다.",
    recommendation: "improvementLoop을 on-demand 이상으로 설정하고, codex-* Skill들을 사용해보세요. 또는 `codex-on-claude log ...`로 수동 기록.",
  }];
}

async function loadThreads() {
  try {
    const files = await fs.readdir(THREADS_DIR);
    const items = [];
    for (const f of files) {
      if (f === "index.json" || !f.endsWith(".json")) continue;
      try { items.push(JSON.parse(await fs.readFile(path.join(THREADS_DIR, f), "utf8"))); } catch { /* skip */ }
    }
    return items;
  } catch { return []; }
}

function ruleStaleActiveThreads(_entries, threadsList) {
  const cutoff = Date.now() - 14 * 86400_000;
  const stale = threadsList.filter((t) => t.status === "active" && new Date(t.lastUsedAt || 0).getTime() < cutoff);
  if (stale.length < 3) return [];
  return [{
    id: "stale-active-threads",
    category: "thread-hygiene",
    title: "오래된 active thread 정리",
    finding: `${stale.length}개 active thread가 14일 이상 미사용입니다 (예: ${stale.slice(0, 3).map((t) => t.title || t.threadId.slice(0, 8)).join(", ")}).`,
    recommendation: "결론이 났다면 status를 resolved 또는 archived로 바꿔 카탈로그 노이즈를 줄이세요.",
    applyHint: `codex-on-claude threads status <id> resolved`,
  }];
}

function ruleIncidentRepeat(_entries, threadsList) {
  const repeated = threadsList.filter((t) => (t.incidents || []).length >= 3);
  if (!repeated.length) return [];
  return repeated.slice(0, 3).map((t) => ({
    id: `incident-repeat-${t.threadId.slice(0, 8)}`,
    category: "reliability",
    title: `thread ${t.threadId.slice(0, 8)}… 에 incident가 ${t.incidents.length}건 누적`,
    finding: `같은 thread에 incident가 3건 이상 — fallback 전략이 부적합할 수 있습니다.`,
    recommendation: t.fallbackStrategy === "ask"
      ? "fallbackStrategy를 'new' 또는 'auto-resume'으로 바꿔 자동 처리로 전환을 검토하세요."
      : "fallbackStrategy 변경 또는 thread를 archive하고 새로 시작하는 것을 검토하세요.",
    applyHint: `codex-on-claude threads fallback ${t.threadId} new`,
  }));
}

function ruleSimilarTagCluster(_entries, threadsList) {
  const tagCount = new Map();
  for (const t of threadsList) {
    for (const tag of (t.tags || [])) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  const heavy = [...tagCount.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
  if (!heavy.length) return [];
  return [{
    id: "tag-cluster-routine",
    category: "new-skill-or-routine",
    title: "같은 태그의 thread가 여러 개 — routine/통합 후보",
    finding: `태그 "${heavy[0][0]}" 가 ${heavy[0][1]}개 thread에 반복 사용됩니다.`,
    recommendation: "이 패턴을 /codex-routine으로 등록하거나 상위 thread를 만들어 결과를 모으세요.",
    applyHint: `codex-on-claude threads list --tag=${heavy[0][0]}`,
  }];
}

const RULES = [
  ruleLargeResponsesNotAgent,
  ruleRepeatedPrompts,
  ruleSandboxMismatch,
  ruleSessionNotFound,
  ruleTimeouts,
  ruleNoLogs,
];

const THREAD_RULES = [
  ruleStaleActiveThreads,
  ruleIncidentRepeat,
  ruleSimilarTagCluster,
];

function filterRecentlyDismissed(candidates, improvements) {
  const cutoff = Date.now() - 14 * 86400_000;
  const recentlyDismissed = new Set(
    improvements
      .filter((i) => i.decision === "rejected" && new Date(i.ts || 0).getTime() > cutoff)
      .map((i) => i.candidateId)
  );
  return candidates.filter((c) => !recentlyDismissed.has(c.id));
}

export async function runAnalyze({ days = 14, format = "text", save = false } = {}) {
  const entries = await loadEntries(days);
  const config = await loadConfig();
  const improvements = await loadRecentImprovements();
  const threadsList = await loadThreads();
  const summary = summarize(entries);
  summary.threadsTotal = threadsList.length;
  summary.threadsActive = threadsList.filter((t) => t.status === "active").length;
  let candidates = [];
  for (const rule of RULES) candidates.push(...rule(entries));
  for (const rule of THREAD_RULES) candidates.push(...rule(entries, threadsList));
  candidates = filterRecentlyDismissed(candidates, improvements);

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    summary,
    activeConfig: config?.choices || null,
    candidates,
  };

  if (save) {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const md = renderMarkdown(report);
    await fs.writeFile(path.join(REPORT_DIR, `${stamp}.md`), md);
    await fs.writeFile(path.join(REPORT_DIR, `${stamp}.json`), JSON.stringify(report, null, 2));
  }

  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "markdown") return renderMarkdown(report);
  return renderText(report);
}

function renderText(r) {
  const lines = [];
  lines.push(`codex-on-claude analyze (last ${r.windowDays} days, generated ${r.generatedAt})`);
  lines.push("");
  lines.push(`Summary:`);
  lines.push(`  total calls: ${r.summary.total} | ok ${r.summary.ok} | failed ${r.summary.failed}`);
  lines.push(`  avg response: ${(r.summary.avgResponse / 1024).toFixed(1)} KB | p95: ${(r.summary.p95Response / 1024).toFixed(1)} KB`);
  lines.push(`  via agent: ${r.summary.viaAgent} / ${r.summary.total}`);
  if (r.summary.threadsTotal !== undefined) {
    lines.push(`  threads: ${r.summary.threadsTotal} total / ${r.summary.threadsActive} active`);
  }
  lines.push("");
  if (!r.candidates.length) {
    lines.push("개선 후보 없음. 현재 사용 패턴이 양호하거나 데이터가 부족합니다.");
  } else {
    lines.push("Improvement candidates:");
    r.candidates.forEach((cnd, i) => {
      lines.push(`  [${i + 1}] (${cnd.category}) ${cnd.title}`);
      lines.push(`      finding: ${cnd.finding}`);
      lines.push(`      recommend: ${cnd.recommendation}`);
      if (cnd.applyHint) lines.push(`      apply hint: ${cnd.applyHint}`);
      if (cnd.examples?.length) lines.push(`      examples: ${cnd.examples.join("; ")}`);
    });
  }
  lines.push("");
  lines.push("Take action:");
  lines.push("  codex-on-claude suggest --apply N");
  lines.push("  codex-on-claude suggest --reject N --reason \"...\"");
  return lines.join("\n");
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# codex-on-claude analysis report`);
  lines.push(``);
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Window: last ${r.windowDays} days`);
  lines.push(`- Total calls: ${r.summary.total} (ok ${r.summary.ok}, failed ${r.summary.failed})`);
  lines.push(`- Avg response: ${(r.summary.avgResponse / 1024).toFixed(1)} KB, p95 ${(r.summary.p95Response / 1024).toFixed(1)} KB`);
  lines.push(`- Routed via subagent: ${r.summary.viaAgent}/${r.summary.total}`);
  if (r.summary.threadsTotal !== undefined) {
    lines.push(`- Threads: ${r.summary.threadsTotal} total, ${r.summary.threadsActive} active`);
  }
  lines.push(``);
  if (!r.candidates.length) {
    lines.push(`## Candidates`);
    lines.push(``);
    lines.push(`No actionable improvement candidates in this window.`);
  } else {
    lines.push(`## Candidates`);
    lines.push(``);
    r.candidates.forEach((cnd, i) => {
      lines.push(`### ${i + 1}. ${cnd.title} (\`${cnd.category}\`)`);
      lines.push(``);
      lines.push(`- **Finding**: ${cnd.finding}`);
      lines.push(`- **Recommendation**: ${cnd.recommendation}`);
      if (cnd.applyHint) lines.push(`- **Apply hint**: \`${cnd.applyHint}\``);
      if (cnd.examples?.length) lines.push(`- **Examples**: ${cnd.examples.join("; ")}`);
      lines.push(``);
    });
  }
  return lines.join("\n");
}

export async function recordDecision({ candidateId, category, decision, appliedChanges, reason }) {
  await fs.mkdir(IMPR_DIR, { recursive: true });
  const ts = new Date().toISOString();
  const file = path.join(IMPR_DIR, `${ts.replace(/[:.]/g, "-")}.json`);
  const entry = { ts, candidateId, category, decision, appliedChanges: appliedChanges || null, reason: reason || null };
  await fs.writeFile(file, JSON.stringify(entry, null, 2));
  return file;
}

export async function appendLog(entry) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `usage-${date}.jsonl`);
  const row = { ts: new Date().toISOString(), ...entry };
  await fs.appendFile(file, JSON.stringify(row) + "\n");
  return file;
}
