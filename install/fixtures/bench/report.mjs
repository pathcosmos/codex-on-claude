#!/usr/bin/env node
// report.mjs — Walk _runs/<RUN_ID>/run*/<scenario>/<arm>/ and emit a markdown summary.
// v0.4.2+: 3-table layout (A=headline, B=cost/latency, C=token detail) + USD pricing + synergy_verdict enum.
// v0.4.3+: + Table D (β advantage matrix by category) + Table E (Skill cost breakdown) + cost-quality quadrant.
//
// Usage: node report.mjs <RUN_ID> [--driver=claude-haiku-4-5] [--callee=gpt-5]

import fs from 'node:fs';
import path from 'node:path';

// Scenario → category map (used for Table D aggregation).
const SCENARIO_CATEGORIES = {
  // Review-only
  'B1-large-diff': 'Review/Audit',
  'B5-secaudit': 'Review/Audit',
  'B7-arch': 'Review/Audit',
  'B12-trap': 'Review/Audit',
  'D1-doc-self-improve': 'Review/Audit',
  // Edit/Fix
  'B2-refactor': 'Edit/Fix',
  'B3-bugfix': 'Edit/Fix',
  'B11-trivial': 'Edit/Fix',
  // Reasoning/Specialty
  'B8-spec': 'Reasoning/Specialty',
  'B9-hostile': 'Reasoning/Specialty',
  'B10-perf': 'Reasoning/Specialty',
  'D2-reasoning-depth': 'Reasoning/Specialty',
  'D4-analyze-improve-loop': 'Reasoning/Specialty',
  // Long-context
  'D3-token-efficiency': 'Long-context',
  'E6-large-codebase-audit': 'Long-context',
  'E7-multi-log-rca': 'Long-context',
  'E9-cross-file-dependency': 'Long-context',
  'E10-doc-corpus-synthesis': 'Long-context',
  // Multi-turn
  'B6-followup': 'Multi-turn',
  'E8-long-thread-debug': 'Multi-turn',
  // Composite chain
  'E1-bug-triage-pipeline': 'Composite chain',
  'E2-security-harden-loop': 'Composite chain',
  'E3-tdd-cycle': 'Composite chain',
  'E4-pr-review-simulation': 'Composite chain',
  'E5-spec-driven-impl': 'Composite chain',
};
function categoryFor(scen) {
  return SCENARIO_CATEGORIES[scen] || 'Uncategorized';
}

const args = process.argv.slice(2);
const runId = args.find((a) => !a.startsWith('--'));
if (!runId) { console.error('usage: report.mjs <RUN_ID> [--driver=...] [--callee=...]'); process.exit(2); }
const flagDriver = args.find((a) => a.startsWith('--driver='))?.split('=')[1];
const flagCallee = args.find((a) => a.startsWith('--callee='))?.split('=')[1];

const here = path.dirname(new URL(import.meta.url).pathname);
const runDir = path.join(here, '_runs', runId);
if (!fs.existsSync(runDir)) { console.error(`no such run: ${runDir}`); process.exit(2); }

const pricingPath = path.join(here, 'PRICING.json');
const PRICING = fs.existsSync(pricingPath)
  ? JSON.parse(fs.readFileSync(pricingPath, 'utf8'))
  : { models: {}, default_models: {}, codex_token_split: { in_ratio: 0.4, out_ratio: 0.6 } };
const driverModel = flagDriver || PRICING.default_models?.claude_driver || 'claude-haiku-4-5';
const calleeModel = flagCallee || PRICING.default_models?.codex_callee || 'gpt-5';
const driverPrice = PRICING.models?.[driverModel];
const calleePrice = PRICING.models?.[calleeModel];

// Walk runs.
const rows = [];
function collectArm(scenPath, scen, runLabel) {
  for (const arm of ['alpha', 'beta']) {
    const armPath = path.join(scenPath, arm);
    if (!fs.existsSync(armPath)) continue;
    const timing = readJsonSafe(path.join(armPath, 'timing.json')) || {};
    const cost = readJsonSafe(path.join(armPath, 'cost.json')) || {};
    const costCodex = readJsonSafe(path.join(armPath, 'cost.codex.json')) || {};
    const result = readJsonSafe(path.join(armPath, 'result.json')) || { score: { passed: 0, total: 0 } };
    const trSizes = readJsonSafe(path.join(armPath, 'tool_result_sizes.json')) || {};
    const toolCallsPath = path.join(armPath, 'tool_calls.jsonl');
    const toolCalls = fs.existsSync(toolCallsPath)
      ? fs.readFileSync(toolCallsPath, 'utf8').split('\n').filter(Boolean).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean)
      : [];

    const inTok = cost.input_tokens ?? 0;
    const outTok = cost.output_tokens ?? 0;
    const cacheRead = cost.cache_read_input_tokens ?? 0;
    const cacheCreate = cost.cache_creation_input_tokens ?? 0;
    const codexTok = costCodex.tokens_est ?? 0;

    // USD computation
    const driverUsd = driverPrice
      ? (inTok * driverPrice.in_per_mtok + outTok * driverPrice.out_per_mtok
         + cacheRead * driverPrice.cache_read_per_mtok + cacheCreate * driverPrice.cache_creation_per_mtok) / 1e6
      : 0;
    const split = PRICING.codex_token_split || { in_ratio: 0.4, out_ratio: 0.6 };
    const codexInTok = Math.floor(codexTok * split.in_ratio);
    const codexOutTok = Math.floor(codexTok * split.out_ratio);
    const codexUsd = calleePrice
      ? (codexInTok * calleePrice.in_per_mtok + codexOutTok * calleePrice.out_per_mtok) / 1e6
      : 0;
    const totalUsd = driverUsd + codexUsd;

    rows.push({
      scenario: scen,
      arm,
      run: runLabel,
      wall_s: timing.wall_s ?? null,
      in_tok: inTok,
      out_tok: outTok,
      cache_read: cacheRead,
      cache_create: cacheCreate,
      codex_est: codexTok,
      tr_p95: trSizes.p95 ?? 0,
      driver_usd: driverUsd,
      codex_usd: codexUsd,
      total_usd: totalUsd,
      passed: result?.score?.passed ?? 0,
      total: result?.score?.total ?? 0,
      tool_calls: toolCalls,
    });
  }
}
function looksLikeScenarioDir(p) {
  return fs.existsSync(path.join(p, 'alpha')) || fs.existsSync(path.join(p, 'beta'));
}
for (const child of fs.readdirSync(runDir).sort()) {
  const childPath = path.join(runDir, child);
  if (!fs.statSync(childPath).isDirectory()) continue;
  if (looksLikeScenarioDir(childPath)) {
    collectArm(childPath, child, 'run1');
  } else {
    for (const scen of fs.readdirSync(childPath).sort()) {
      const scenPath = path.join(childPath, scen);
      if (!fs.statSync(scenPath).isDirectory()) continue;
      collectArm(scenPath, scen, child);
    }
  }
}

// Aggregate per (scenario, arm).
const groups = new Map();
for (const r of rows) {
  const k = `${r.scenario}|${r.arm}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const scenarios = [...new Set(rows.map((r) => r.scenario))].sort();

function aggregate(group) {
  if (!group.length) return null;
  const tots = group.map((r) => r.total).filter((x) => x > 0);
  const totMax = tots.length ? Math.max(...tots) : 0;
  const passedAvg = group.reduce((a, r) => a + (r.passed || 0), 0) / group.length;
  const frac = totMax ? passedAvg / totMax : 0;
  return {
    n: group.length,
    score_frac: frac,
    score_text: `${passedAvg.toFixed(1)}/${totMax}`,
    wall_s_med: median(group.map((r) => r.wall_s).filter((x) => x != null)),
    wall_s_mad: mad(group.map((r) => r.wall_s).filter((x) => x != null)),
    in_tok_avg: avg(group.map((r) => r.in_tok)),
    out_tok_avg: avg(group.map((r) => r.out_tok)),
    cache_read_avg: avg(group.map((r) => r.cache_read)),
    codex_est_avg: avg(group.map((r) => r.codex_est)),
    tr_p95_med: median(group.map((r) => r.tr_p95).filter((x) => x != null)),
    driver_usd_med: median(group.map((r) => r.driver_usd).filter((x) => x != null)),
    codex_usd_med: median(group.map((r) => r.codex_usd).filter((x) => x != null)),
    total_usd_med: median(group.map((r) => r.total_usd).filter((x) => x != null)),
  };
}

function synergyVerdict(a, b) {
  if (!a || !b) return 'n/a';
  const dQ = b.score_frac - a.score_frac;
  const ratio = a.total_usd_med > 0 ? b.total_usd_med / a.total_usd_med : (b.total_usd_med > 0 ? Infinity : 1);
  if (dQ < -0.01) return 'β-harmful';
  if (dQ <= 0.01) {
    if (ratio > 1.5) return 'β-redundant';
    if (ratio < 0.85) return 'α-win';
    return 'tie';
  }
  if (dQ > 0.20) return 'β-strict-win';
  return 'β-win';
}

// ---- emit markdown ----
const md = [];
md.push(`# Bench report — run \`${runId}\``);
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Driver model: \`${driverModel}\`${driverPrice ? '' : ' ⚠ pricing missing'} · Codex callee: \`${calleeModel}\`${calleePrice ? '' : ' ⚠ pricing missing'} · Pricing as_of: ${PRICING.as_of_date || 'unknown'}`);
md.push('');
md.push(`Source artifacts: \`install/fixtures/bench/_runs/${runId}/\` (gitignored).`);
md.push('');

// Table A — Headline
md.push('## Table A — Headline (α vs β quality)');
md.push('');
md.push('| Scenario | N | α score | β score | Δscore | Synergy verdict |');
md.push('|---|---:|---:|---:|---:|---|');
const verdictCounts = {};
for (const s of scenarios) {
  const a = aggregate(groups.get(`${s}|alpha`) || []);
  const b = aggregate(groups.get(`${s}|beta`) || []);
  const n = Math.max(a?.n || 0, b?.n || 0);
  const dQ = (b?.score_frac ?? 0) - (a?.score_frac ?? 0);
  const v = synergyVerdict(a, b);
  verdictCounts[v] = (verdictCounts[v] || 0) + 1;
  md.push(`| ${s} | ${n} | ${a?.score_text ?? 'n/a'} | ${b?.score_text ?? 'n/a'} | ${pct(dQ)} | ${v} |`);
}
md.push('');

// Table B — Cost/Latency
md.push('## Table B — Cost & latency (USD, wall-clock seconds)');
md.push('');
md.push('| Scenario | α $ | β $ | Δ$ | Δ% | α wall (s) | β wall (s) | Δwall (s) |');
md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
let sumA = 0, sumB = 0;
for (const s of scenarios) {
  const a = aggregate(groups.get(`${s}|alpha`) || []);
  const b = aggregate(groups.get(`${s}|beta`) || []);
  const aUsd = a?.total_usd_med ?? 0;
  const bUsd = b?.total_usd_med ?? 0;
  const dUsd = bUsd - aUsd;
  const dPct = aUsd > 0 ? (dUsd / aUsd) * 100 : null;
  const aW = a?.wall_s_med ?? null;
  const bW = b?.wall_s_med ?? null;
  const dW = (aW != null && bW != null) ? bW - aW : null;
  sumA += aUsd; sumB += bUsd;
  md.push(`| ${s} | ${usd(aUsd)} | ${usd(bUsd)} | ${usd(dUsd)} | ${dPct == null ? 'n/a' : dPct.toFixed(1) + '%'} | ${fmtNum(aW)} | ${fmtNum(bW)} | ${fmtNum(dW)} |`);
}
md.push('');

// Table C — Token detail (β-focused; α appears as comparison column for input_tokens)
md.push('## Table C — Token detail (per-run averages; β includes Codex split)');
md.push('');
md.push('| Scenario | Arm | claude_in | claude_out | claude_cache_read | codex_est | tr_p95(chars) | driver $ | codex $ | total $ |');
md.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const s of scenarios) {
  for (const arm of ['alpha', 'beta']) {
    const g = aggregate(groups.get(`${s}|${arm}`) || []);
    if (!g) continue;
    md.push(`| ${s} | ${arm} | ${fmtNum(g.in_tok_avg)} | ${fmtNum(g.out_tok_avg)} | ${fmtNum(g.cache_read_avg)} | ${fmtNum(g.codex_est_avg)} | ${fmtNum(g.tr_p95_med)} | ${usd(g.driver_usd_med)} | ${usd(g.codex_usd_med)} | ${usd(g.total_usd_med)} |`);
  }
}
md.push('');

// Table D — β advantage matrix by category
md.push('## Table D — β 우위 매트릭스 (카테고리별 집계)');
md.push('');
md.push('| Category | Scenarios | β-win | tie | α-win | β-redundant | β-harmful | mean Δquality (pp) | mean cost ratio (β/α) |');
md.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
const byCategory = new Map();
for (const s of scenarios) {
  const cat = categoryFor(s);
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(s);
}
for (const [cat, scens] of [...byCategory].sort((x, y) => x[0].localeCompare(y[0]))) {
  let bWin = 0, ties = 0, aWin = 0, bRed = 0, bHarm = 0, bStrict = 0;
  let dQs = [], ratios = [];
  for (const s of scens) {
    const a = aggregate(groups.get(`${s}|alpha`) || []);
    const b = aggregate(groups.get(`${s}|beta`) || []);
    if (!a || !b) continue;
    const v = synergyVerdict(a, b);
    if (v === 'β-win' || v === 'β-strict-win') bWin++;
    else if (v === 'tie') ties++;
    else if (v === 'α-win') aWin++;
    else if (v === 'β-redundant') bRed++;
    else if (v === 'β-harmful') bHarm++;
    if (v === 'β-strict-win') bStrict++;
    dQs.push(b.score_frac - a.score_frac);
    if (a.total_usd_med > 0) ratios.push(b.total_usd_med / a.total_usd_med);
  }
  const meanDqCat = dQs.length ? dQs.reduce((x, y) => x + y, 0) / dQs.length * 100 : 0;
  const meanRatio = ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length : 0;
  md.push(`| ${cat} | ${scens.join(', ')} | ${bWin} | ${ties} | ${aWin} | ${bRed} | ${bHarm} | ${meanDqCat.toFixed(2)} | ${meanRatio.toFixed(2)}× |`);
}
md.push('');

// Table E — Skill cost breakdown (β only, aggregated across all scenarios + runs)
md.push('## Table E — Skill 별 비용 breakdown (β arm, all scenarios)');
md.push('');
md.push('| Tool / Skill | Total invocations | Scenarios | Mean codex tokens/call | Estimated total USD |');
md.push('|---|---:|---:|---:|---:|');
const skillStats = new Map(); // name → {count, scenarios:Set, totalChars}
for (const r of rows.filter((r) => r.arm === 'beta')) {
  for (const tc of r.tool_calls || []) {
    const name = tc.name || 'unknown';
    if (!skillStats.has(name)) skillStats.set(name, { count: 0, scenarios: new Set(), tokenSum: 0 });
    const stat = skillStats.get(name);
    stat.count++;
    stat.scenarios.add(r.scenario);
  }
}
// Per-scenario Codex tokens are tracked at scenario level (cost.codex.json). Distribute proportionally
// to mcp__codex__* invocations across β rows for an estimate.
for (const r of rows.filter((r) => r.arm === 'beta')) {
  const codexInvs = (r.tool_calls || []).filter((tc) => (tc.name || '').startsWith('mcp__codex__'));
  if (!codexInvs.length || r.codex_est === 0) continue;
  const perCall = r.codex_est / codexInvs.length;
  for (const tc of codexInvs) {
    const stat = skillStats.get(tc.name);
    if (stat) stat.tokenSum += perCall;
  }
}
const sortedSkills = [...skillStats.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [name, stat] of sortedSkills) {
  const meanTokens = stat.count > 0 ? stat.tokenSum / stat.count : 0;
  // Rough USD using callee pricing if codex skill, otherwise n/a
  let usdEst = 0;
  if (name.startsWith('mcp__codex__') && calleePrice) {
    const split = PRICING.codex_token_split || { in_ratio: 0.4, out_ratio: 0.6 };
    const inT = stat.tokenSum * split.in_ratio;
    const outT = stat.tokenSum * split.out_ratio;
    usdEst = (inT * calleePrice.in_per_mtok + outT * calleePrice.out_per_mtok) / 1e6;
  }
  md.push(`| \`${name}\` | ${stat.count} | ${stat.scenarios.size} | ${fmtNum(meanTokens)} | ${usdEst > 0 ? usd(usdEst) : '—'} |`);
}
md.push('');

// Cost-quality scatter (quadrant analysis)
md.push('## Cost-Quality 산점도 (quadrant 분석)');
md.push('');
md.push('각 시나리오의 (Δquality, Δcost) 위치 — 사분면 분류:');
md.push('- **win-cheap**: β 가 더 좋고 더 싸다 (Δquality>0 & Δcost<0) — 이상적');
md.push('- **win-expensive**: β 가 더 좋지만 더 비싸다 (Δquality>0 & Δcost>0) — 비용 정당화 필요');
md.push('- **redundant**: 품질 동등 + β 가 더 비싸다 (Δquality≈0 & Δcost>0) — 호출 회피 권장');
md.push('- **cheap-but-equal**: β 가 더 싸다 + 품질 동등 (Δquality≈0 & Δcost<0) — 우연 또는 캐시 이득');
md.push('- **harmful**: β 가 더 나쁘다 (Δquality<0) — 호출 금기');
md.push('');
md.push('| Scenario | Δquality (pp) | Δcost ($) | Quadrant |');
md.push('|---|---:|---:|---|');
for (const s of scenarios) {
  const a = aggregate(groups.get(`${s}|alpha`) || []);
  const b = aggregate(groups.get(`${s}|beta`) || []);
  if (!a || !b) continue;
  const dQ = (b.score_frac - a.score_frac) * 100;
  const dC = b.total_usd_med - a.total_usd_med;
  let q;
  if (dQ < -1) q = 'harmful';
  else if (dQ > 1 && dC < 0) q = 'win-cheap';
  else if (dQ > 1 && dC >= 0) q = 'win-expensive';
  else if (Math.abs(dQ) <= 1 && dC > 0.01) q = 'redundant';
  else if (Math.abs(dQ) <= 1 && dC < -0.01) q = 'cheap-but-equal';
  else q = 'neutral';
  md.push(`| ${s} | ${dQ.toFixed(1)} | ${usd(dC)} | ${q} |`);
}
md.push('');

// N=3 variance analysis
const nGt1 = scenarios.filter((s) => {
  const a = groups.get(`${s}|alpha`) || [];
  return a.length > 1;
});
if (nGt1.length) {
  md.push('## N>1 분산 분석 (안정성 신뢰도)');
  md.push('');
  md.push('| Scenario | N | α wall median±MAD (s) | β wall median±MAD (s) | α score consistency | β score consistency |');
  md.push('|---|---:|---|---|---|---|');
  for (const s of nGt1) {
    const a = aggregate(groups.get(`${s}|alpha`) || []);
    const b = aggregate(groups.get(`${s}|beta`) || []);
    if (!a || !b) continue;
    const aScores = (groups.get(`${s}|alpha`) || []).map((r) => r.passed);
    const bScores = (groups.get(`${s}|beta`) || []).map((r) => r.passed);
    const aConsist = aScores.length > 0 ? `${Math.min(...aScores)}-${Math.max(...aScores)} / ${a.score_text.split('/')[1]}` : 'n/a';
    const bConsist = bScores.length > 0 ? `${Math.min(...bScores)}-${Math.max(...bScores)} / ${b.score_text.split('/')[1]}` : 'n/a';
    md.push(`| ${s} | ${a.n} | ${fmtNum(a.wall_s_med)}±${fmtNum(a.wall_s_mad)} | ${fmtNum(b.wall_s_med)}±${fmtNum(b.wall_s_mad)} | ${aConsist} | ${bConsist} |`);
  }
  md.push('');
}

// Aggregate summary
md.push('## Aggregate');
md.push('');
const dTotal = sumB - sumA;
const verdictLine = Object.entries(verdictCounts).map(([k, v]) => `${k}: ${v}`).join(' · ');
md.push(`- Total cost: α=${usd(sumA)} · β=${usd(sumB)} · Δ=${usd(dTotal)}`);
md.push(`- Verdict distribution: ${verdictLine}`);
const meanDq = scenarios.map((s) => {
  const a = aggregate(groups.get(`${s}|alpha`) || []);
  const b = aggregate(groups.get(`${s}|beta`) || []);
  return (b?.score_frac ?? 0) - (a?.score_frac ?? 0);
}).reduce((x, y) => x + y, 0) / Math.max(scenarios.length, 1);
md.push(`- Mean Δquality (β−α): ${(meanDq * 100).toFixed(2)} pp`);
const findingsLift = scenarios.reduce((acc, s) => {
  const a = aggregate(groups.get(`${s}|alpha`) || []);
  const b = aggregate(groups.get(`${s}|beta`) || []);
  return acc + ((b?.score_frac ?? 0) - (a?.score_frac ?? 0)) * (a?.score_text ? parseFloat(a.score_text.split('/')[1]) || 0 : 0);
}, 0);
const fpd = dTotal > 0 ? findingsLift / dTotal : null;
md.push(`- Findings-per-dollar lift: ${fpd == null ? 'n/a (β not more expensive)' : fpd.toFixed(1)} extra findings per extra $1 spent on β`);
md.push('');

md.push('## Caveats');
md.push('');
md.push(`- Driver model hardcoded to \`${driverModel}\` (see \`run.sh:42\` — \`--model haiku\`). Generalization to Sonnet/Opus requires re-running.`);
md.push('- Codex tokens estimated via char/4 of `mcp__codex__codex*` `tool_result` content — accurate to ±30%.');
md.push(`- USD prices from \`PRICING.json\` (as_of ${PRICING.as_of_date || 'unknown'}). Update that file when rates change.`);
md.push('- Codex token split into input/output uses fixed ratio from PRICING.codex_token_split — actual breakdown unknown.');
md.push('- N>1: score = mean across runs; wall_s/USD = median; tokens = per-run average.');
md.push('- Synergy verdict thresholds: β-strict-win Δscore>0.20pp · β-win Δscore>0.01pp · tie |Δscore|≤0.01pp · α-win β-cost<0.85× · β-redundant β-cost>1.5× & Δscore≈0 · β-harmful Δscore<-0.01pp.');
md.push('- See `docs/test-claude-vs-codex-bench.md` for the full caveats section.');

console.log(md.join('\n'));

// ---- helpers ----
function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mad(arr) {
  if (arr.length < 2) return 0;
  const m = median(arr);
  return median(arr.map((x) => Math.abs(x - m)));
}
function avg(arr) {
  const xs = arr.filter((x) => x != null);
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function fmtNum(x) {
  if (x == null) return 'n/a';
  if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString();
  return (Math.round(x * 10) / 10).toString();
}
function usd(x) {
  if (x == null) return 'n/a';
  if (Math.abs(x) < 0.01) return `$${x.toFixed(4)}`;
  return `$${x.toFixed(3)}`;
}
function pct(x) {
  if (x == null) return 'n/a';
  const sign = x > 0 ? '+' : '';
  return `${sign}${(x * 100).toFixed(1)}pp`;
}
