#!/usr/bin/env node
// complexity-metric.mjs — Compute 4-dimensional complexity score for a scenario directory.
//
// Usage:
//   node complexity-metric.mjs <scenario-dir>           # single
//   node complexity-metric.mjs --all                    # all scenarios (v1-v6)
//   node complexity-metric.mjs --all --json             # JSON output
//
// Dimensions:
//   D1_LOC          — lines of code in src/ (0/1/2/3 for <100, 100-500, 500-2000, >2000)
//   D2_semantic     — manual from meta.json or heuristic (0-3)
//   D3_edge_density — count of ORACLE criteria + spec edge mentions (0-3)
//   D4_multi_file   — file count in src/ (0/1/2/3 for 1, 2-3, 5-8, 10+)
//
// Combined C = D1 + D2 + D3 + D4 (range 0-12)

import fs from 'node:fs';
import path from 'node:path';

const BENCH = '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/fixtures/bench';

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function getLOC(srcDir) {
  if (!fs.existsSync(srcDir)) return 0;
  let total = 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fp);
      else {
        try {
          const content = fs.readFileSync(fp, 'utf8');
          total += content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
        } catch {}
      }
    }
  }
  walk(srcDir);
  return total;
}

function getFileCount(srcDir) {
  if (!fs.existsSync(srcDir)) return 0;
  let n = 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fp);
      else n++;
    }
  }
  walk(srcDir);
  return n;
}

function tierFromLOC(loc) {
  if (loc < 100) return 0;
  if (loc < 500) return 1;
  if (loc < 2000) return 2;
  return 3;
}
function tierFromFileCount(n) {
  if (n <= 1) return 0;
  if (n <= 3) return 1;
  if (n <= 8) return 2;
  return 3;
}

function semanticHeuristic(scenDir, srcDir) {
  // Heuristic: look for keywords in src/ files indicating semantic depth
  let depth = 0;
  if (!fs.existsSync(srcDir)) return 0;
  let combined = '';
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fp);
      else if (entry.name.match(/\.(js|ts|py|go|rs|java)$/)) {
        try { combined += fs.readFileSync(fp, 'utf8'); } catch {}
      }
    }
  }
  walk(srcDir);
  // depth indicators
  const indicators = [
    /class\s+\w+/g,           // class defs
    /async\s+function|await\s/g,  // async
    /Mutex|Lock|atomic|sync\./g,   // concurrency
    /interface\s+\w+|trait\s+\w+/g, // interfaces
    /implements\s+\w+|extends\s+\w+/g, // inheritance
    /require\(|import\s+\{/g,  // multi-file dependency
    /TODO|FIXME|HACK|XXX/g,     // known issues
    /catch\s*\(|throw\s+new/g,  // error handling depth
  ];
  for (const re of indicators) {
    const matches = combined.match(re);
    if (matches && matches.length > 2) depth++;
  }
  return Math.min(depth, 3);
}

function edgeDensity(scenDir) {
  const oraclePath = path.join(scenDir, 'ORACLE.json');
  const oracle = readJsonSafe(oraclePath);
  if (!oracle) return 0;
  const criteria_count = (oracle.criteria || []).length;
  if (criteria_count <= 2) return 0;
  if (criteria_count <= 5) return 1;
  if (criteria_count <= 8) return 2;
  return 3;
}

export function computeComplexity(scenDir) {
  const srcDir = path.join(scenDir, 'src');
  const meta = readJsonSafe(path.join(scenDir, 'meta.json'));

  const loc = getLOC(srcDir);
  const fileCount = getFileCount(srcDir);
  const d1 = tierFromLOC(loc);
  const d4 = tierFromFileCount(fileCount);
  const d3 = edgeDensity(scenDir);

  // D2 prefer meta override, else heuristic
  let d2;
  if (meta?.complexity?.D2_semantic !== undefined) d2 = meta.complexity.D2_semantic;
  else d2 = semanticHeuristic(scenDir, srcDir);

  return {
    D1_LOC: d1, D2_semantic: d2, D3_edge: d3, D4_multi_file: d4,
    C: d1 + d2 + d3 + d4,
    raw: { loc, file_count: fileCount, criteria_count: (readJsonSafe(path.join(scenDir, 'ORACLE.json'))?.criteria || []).length },
  };
}

// CLI dispatcher
const args = process.argv.slice(2);
const all = args.includes('--all');
const asJson = args.includes('--json');

if (all) {
  // Walk all bench directories
  const candidates = [];
  // v1-v4 + perturbations
  for (const d of fs.readdirSync(BENCH)) {
    if (d.match(/^(B|D|E|T)\d+/)) candidates.push(path.join(BENCH, d));
  }
  // v5 scenarios
  const v5Dir = path.join(BENCH, 'scenarios-v5');
  if (fs.existsSync(v5Dir)) {
    for (const d of fs.readdirSync(v5Dir)) {
      if (d.match(/^(T|L)\w+-\w+/)) candidates.push(path.join(v5Dir, d));
    }
  }
  // v6 scenarios
  const v6Dir = path.join(BENCH, 'scenarios-v6');
  if (fs.existsSync(v6Dir)) {
    for (const d of fs.readdirSync(v6Dir)) {
      if (d.match(/^(T|R)\w+-?\w+/)) candidates.push(path.join(v6Dir, d));
    }
  }

  const results = [];
  for (const scenDir of candidates) {
    if (!fs.statSync(scenDir).isDirectory()) continue;
    if (!fs.existsSync(path.join(scenDir, 'src'))) continue;
    const c = computeComplexity(scenDir);
    results.push({ scenario: path.basename(scenDir), location: path.relative(BENCH, scenDir), ...c });
  }

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('| Scenario | Location | LOC | Files | Criteria | D1 | D2 | D3 | D4 | C |');
    console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    results.sort((a, b) => b.C - a.C);
    for (const r of results) {
      console.log(`| ${r.scenario} | ${r.location.includes('scenarios-v') ? r.location.split('/')[0] : 'bench/'} | ${r.raw.loc} | ${r.raw.file_count} | ${r.raw.criteria_count} | ${r.D1_LOC} | ${r.D2_semantic} | ${r.D3_edge} | ${r.D4_multi_file} | **${r.C}** |`);
    }
  }
} else if (args[0]) {
  const c = computeComplexity(args[0]);
  console.log(JSON.stringify(c, null, 2));
} else {
  console.error('usage: node complexity-metric.mjs <scenario-dir> | --all [--json]');
  process.exit(2);
}
