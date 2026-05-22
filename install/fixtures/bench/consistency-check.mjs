#!/usr/bin/env node
// consistency-check.mjs — Automated cross-doc consistency check for guidance docs.
// Scans guidance-*.md + v*-*.md for contradictions.

import fs from 'node:fs';
import path from 'node:path';

const DOCS_DIR = '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/docs';

// Patterns to extract: claim_id, source_doc, claim_text, numeric_value
const docs = fs.readdirSync(DOCS_DIR).filter((f) => f.match(/^(guidance|v\d).*\.md$/));
console.log(`Scanning ${docs.length} docs:`);
docs.forEach((d) => console.log(`  - ${d}`));
console.log();

// Numeric claim patterns
const patterns = [
  { name: 'P1_self_review_synergy', regex: /\bD1[^.]*?\+?(\-?\d+(?:\.\d+)?)\s*pp/g, normalize: (m) => parseFloat(m[1]) },
  { name: 'spearman_rho', regex: /Spearman\s*ρ\s*=\s*(-?\d+(?:\.\d+)?)/g, normalize: (m) => parseFloat(m[1]) },
  { name: 'sweet_spot_pp', regex: /(?:50-75%|sweet spot)[^.]{0,50}?\+?(\d+(?:\.\d+)?)\s*pp/g, normalize: (m) => parseFloat(m[1]) },
  { name: 'ceiling_pp', regex: /(?:95-100%|ceiling)[^.]{0,80}?(-?\d+(?:\.\d+)?)\s*pp/g, normalize: (m) => parseFloat(m[1]) },
  { name: 'p2_adversarial_pp', regex: /(?:adversarial|P2)[^.]{0,80}?\+?(\d+(?:\.\d+)?)\s*pp/gi, normalize: (m) => parseFloat(m[1]) },
  { name: 'p5_catastrophe_pp', regex: /(?:catastrophe|P5)[^.]{0,80}?(-?\d+(?:\.\d+)?)\s*pp/gi, normalize: (m) => parseFloat(m[1]) },
];

const findings = {};
for (const doc of docs) {
  const content = fs.readFileSync(path.join(DOCS_DIR, doc), 'utf8');
  for (const p of patterns) {
    if (!findings[p.name]) findings[p.name] = [];
    let m;
    p.regex.lastIndex = 0;
    while ((m = p.regex.exec(content)) !== null) {
      findings[p.name].push({ doc, value: p.normalize(m), context: content.substring(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\n/g, ' ') });
    }
  }
}

console.log('## Cross-Doc Numeric Consistency\n');
for (const [name, entries] of Object.entries(findings)) {
  const values = entries.map((e) => e.value);
  const unique = [...new Set(values)];
  const flag = unique.length > 1 ? '⚠️' : '✅';
  console.log(`### ${flag} ${name} — ${entries.length} occurrences, ${unique.length} distinct values`);
  console.log(`Values: ${unique.join(', ')}`);
  // Show occurrences grouped by value
  const byVal = {};
  for (const e of entries) {
    if (!byVal[e.value]) byVal[e.value] = [];
    byVal[e.value].push(e);
  }
  for (const [v, list] of Object.entries(byVal)) {
    console.log(`  ${v}: ${list.length} mentions (${list.map((l) => l.doc).join(', ')})`);
  }
  console.log();
}

// Section-level contradiction check (v10: context-aware filter)
console.log('## P1 Self-Review verdict drift check\n');
const p1Drift = [];
for (const doc of docs) {
  const content = fs.readFileSync(path.join(DOCS_DIR, doc), 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/Self-review|self-review|P1|D1[^0-9]/.test(lines[i])) {
      const lower = lines[i].toLowerCase();

      // v10 context filters — exclude reconciled / evidence / anti-test citations.
      // These are not real contradictions; earlier check counted them as drift.
      const reconciled = /조건부|conditional|complex real|context-dependent|⚠|in complex|in real-world|real-world|synthetic|n=\d/.test(lower);
      const anti_test = /t7anti|anti-test|reverse|stripped|refuted/.test(lower);
      if (reconciled || anti_test) continue;

      let stance = null;
      if (/negative|harmful|−1[0-9]|-1[0-9]|−2[0-9]|-2[0-9]|−3[0-9]|-3[0-9]/.test(lower)) stance = 'negative';
      else if (/win|\+\d|recommended|★|최강|권장/.test(lower)) stance = 'positive';
      if (stance) p1Drift.push({ doc, line: i + 1, stance, text: lines[i].slice(0, 100) });
    }
  }
}
const stanceCount = { positive: 0, negative: 0, conditional: 0 };
for (const d of p1Drift) stanceCount[d.stance]++;
console.log('Stance count:', stanceCount);
if (stanceCount.positive > 0 && stanceCount.negative > 0) {
  console.log('⚠️ P1 has both positive and negative stances across docs/sections');
  for (const d of p1Drift.filter((x) => x.stance === 'positive').slice(0, 5)) {
    console.log(`  POSITIVE: ${d.doc}:${d.line} - ${d.text}`);
  }
  for (const d of p1Drift.filter((x) => x.stance === 'negative').slice(0, 5)) {
    console.log(`  NEGATIVE: ${d.doc}:${d.line} - ${d.text}`);
  }
} else {
  console.log('✅ P1 stance consistent across docs');
}
