#!/usr/bin/env node
// report.mjs — Walk _runs/<RUN_ID>/run*/<scenario>/<arm>/ and emit a markdown summary.
//
// Usage: node report.mjs <RUN_ID>

import fs from 'node:fs';
import path from 'node:path';

const [, , runId] = process.argv;
if (!runId) { console.error('usage: report.mjs <RUN_ID>'); process.exit(2); }

const here = path.dirname(new URL(import.meta.url).pathname);
const runDir = path.join(here, '_runs', runId);
if (!fs.existsSync(runDir)) { console.error(`no such run: ${runDir}`); process.exit(2); }

// Walk runs. Two supported layouts:
//   (A) flat:    _runs/<RUN_ID>/<scenario>/<arm>/...
//   (B) nested:  _runs/<RUN_ID>/run<r>/<scenario>/<arm>/...
// Detect by checking whether the first-level entry contains an `alpha`/`beta` arm dir.
const rows = []; // {scenario, arm, run, wall_s, in, out, codex_est, score_passed, score_total}
function collectArm(scenPath, scen, runLabel) {
  for (const arm of ['alpha', 'beta']) {
    const armPath = path.join(scenPath, arm);
    if (!fs.existsSync(armPath)) continue;
    const timing = readJsonSafe(path.join(armPath, 'timing.json')) || {};
    const cost = readJsonSafe(path.join(armPath, 'cost.json')) || {};
    const costCodex = readJsonSafe(path.join(armPath, 'cost.codex.json')) || {};
    const result = readJsonSafe(path.join(armPath, 'result.json')) || { score: { passed: 0, total: 0 } };
    rows.push({
      scenario: scen,
      arm,
      run: runLabel,
      wall_s: timing.wall_s ?? null,
      in_tok: cost.input_tokens ?? null,
      out_tok: cost.output_tokens ?? null,
      cache_read: cost.cache_read_input_tokens ?? null,
      codex_est: costCodex.tokens_est ?? 0,
      passed: result?.score?.passed ?? 0,
      total: result?.score?.total ?? 0,
    });
  }
}
function looksLikeScenarioDir(p) {
  // A scenario dir contains at least one of alpha/beta subdirs.
  return fs.existsSync(path.join(p, 'alpha')) || fs.existsSync(path.join(p, 'beta'));
}
for (const child of fs.readdirSync(runDir).sort()) {
  const childPath = path.join(runDir, child);
  if (!fs.statSync(childPath).isDirectory()) continue;
  if (looksLikeScenarioDir(childPath)) {
    // Layout A: this child IS a scenario.
    collectArm(childPath, child, 'run1');
  } else {
    // Layout B: this child is a `run<r>`, descend.
    for (const scen of fs.readdirSync(childPath).sort()) {
      const scenPath = path.join(childPath, scen);
      if (!fs.statSync(scenPath).isDirectory()) continue;
      collectArm(scenPath, scen, child);
    }
  }
}

// Aggregate per (scenario, arm): median of wall_s, sum of tokens (or median if N>1), avg score.
const groups = new Map(); // key = scenario|arm
for (const r of rows) {
  const k = `${r.scenario}|${r.arm}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const scenarios = [...new Set(rows.map((r) => r.scenario))].sort();

// ---- emit markdown ----
const md = [];
md.push(`# Bench report — run \`${runId}\``);
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('');
md.push(`Source artifacts under \`install/fixtures/bench/_runs/${runId}/\` (gitignored).`);
md.push('');
md.push('## Summary');
md.push('');
md.push('| Scenario | N | α wall(s) | β wall(s) | α tok(in/out) | β tok(in/out) | β codex~ | α score | β score | Verdict |');
md.push('|---|---:|---:|---:|---|---|---:|---:|---:|---|');

let aWins = 0, bWins = 0, ties = 0;
for (const s of scenarios) {
  const a = groups.get(`${s}|alpha`) || [];
  const b = groups.get(`${s}|beta`) || [];
  const n = Math.max(a.length, b.length);
  const aw = median(a.map((r) => r.wall_s).filter((x) => x != null));
  const bw = median(b.map((r) => r.wall_s).filter((x) => x != null));
  const aIn = sum(a.map((r) => r.in_tok || 0));
  const aOut = sum(a.map((r) => r.out_tok || 0));
  const bIn = sum(b.map((r) => r.in_tok || 0));
  const bOut = sum(b.map((r) => r.out_tok || 0));
  const bCodex = sum(b.map((r) => r.codex_est || 0));
  const aScore = avgScore(a);
  const bScore = avgScore(b);
  let verdict;
  if (aScore.frac > bScore.frac + 0.01) { verdict = 'α wins'; aWins++; }
  else if (bScore.frac > aScore.frac + 0.01) { verdict = 'β wins'; bWins++; }
  else { verdict = 'tie'; ties++; }
  md.push(`| ${s} | ${n} | ${fmtNum(aw)} | ${fmtNum(bw)} | ${aIn}/${aOut} | ${bIn}/${bOut} | ~${bCodex} | ${aScore.text} | ${bScore.text} | ${verdict} |`);
}
md.push('');
md.push(`**Aggregate:** β wins ${bWins} · α wins ${aWins} · tie ${ties} (of ${scenarios.length})`);
md.push('');
md.push('## Caveats');
md.push('');
md.push('- Wall time is the median when N>1, otherwise the single observation.');
md.push('- Token counts are SUMS across all N runs (so β-codex~ in particular grows with N — divide by N for per-run comparison).');
md.push('- `β codex~` is a char/4 estimate, accurate to ±30%. Exact accounting requires the MCP `usage` field which is not always populated.');
md.push('- Verdict thresholds: a score-fraction delta of >0.01 is required to declare a winner.');
md.push('- See `docs/test-claude-vs-codex-bench.md` for the full caveats section.');

console.log(md.join('\n'));

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
function sum(arr) { return arr.reduce((a, b) => a + (b || 0), 0); }
function avgScore(group) {
  if (!group.length) return { frac: 0, text: 'n/a' };
  const tots = group.map((r) => r.total).filter((x) => x > 0);
  const tot = tots.length ? Math.max(...tots) : 0;
  const passed = group.reduce((a, r) => a + (r.passed || 0), 0) / group.length;
  const frac = tot ? passed / tot : 0;
  return { frac, text: `${passed.toFixed(1)}/${tot}` };
}
function fmtNum(x) { return x == null ? 'n/a' : (Math.round(x * 10) / 10).toString(); }
