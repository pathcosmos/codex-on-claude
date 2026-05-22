#!/usr/bin/env node
// extract-real.mjs — Extract real codebase modules into v6 R-series scenarios.

import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);

const EXTRACTS = [
  // === codex-on-claude self (dogfooding) ===
  { id: 'R01', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/hooks.mjs', dst: 'hooks.mjs', category: 'Code review', task: 'review', focus: 'hook merging + mixed-ownership safety' },
  { id: 'R02', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/templater.mjs', dst: 'templater.mjs', category: 'Code review', task: 'review', focus: 'template substitution logic' },
  { id: 'R03', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/threads.mjs', dst: 'threads.mjs', category: 'Code review', task: 'review', focus: 'thread catalog CRUD + fallbackStrategy' },
  { id: 'R04', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/analyze.mjs', dst: 'analyze.mjs', category: 'Architecture review', task: 'review', focus: '9-rule analyzer engine' },
  { id: 'R05_slice', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/install.mjs', dst: 'install_excerpt.mjs', category: 'Code review', task: 'review', focus: 'reconfigure flow + CLI flag handling', slice_start: 1, slice_end: 400 },
  // === external codebases ===
  { id: 'R06', src: '/Users/lanco/aidata/pathcosmos/cli-ascii-usage/src/cli.ts', dst: 'cli.ts', category: 'Code review', task: 'review', focus: 'CLI argument parsing + ASCII rendering' },
  { id: 'R07', src: '/Users/lanco/aidata/pathcosmos/cli-ascii-usage/src/model.ts', dst: 'model.ts', category: 'Type review', task: 'review', focus: 'TypeScript model + data flow' },
  { id: 'R08', src: '/Users/lanco/exdata/contents_blocker/itssa_airflow_vscode/scripts/scrape_post_links.py', dst: 'scrape_post_links.py', category: 'Code review (Python)', task: 'review', focus: 'web scraper logic + error handling', slice_start: 1, slice_end: 250 },
  { id: 'R09', src: '/Users/lanco/exdata/contents_blocker/itssa_airflow_vscode/scripts/test_single_post_to_mongo.py', dst: 'test_mongo.py', category: 'Code review (Python)', task: 'review', focus: 'MongoDB test + edge cases' },
  { id: 'R10', src: '/Users/lanco/aidata/pathcosmos/claudflare_web/.astro/content.d.ts', dst: 'content.d.ts', category: 'Type review', task: 'review', focus: 'TypeScript type definitions' },
];

function buildPromptAlpha(focus) {
  return `Review the source file in src/. Focus on: **${focus}**. Identify the 3 most significant issues (bugs, design problems, or improvement opportunities). Ignore trivial style issues.\n\nEnd with a fenced \`\`\`json block:\n\n\`\`\`json\n{\n  "issues": [\n    {"category": "bug" | "design" | "performance" | "security" | "other",\n     "severity": "high" | "medium" | "low",\n     "summary": "<≤30 words>"}\n  ],\n  "total_issues_found": <int>\n}\n\`\`\`\n\nProse ≤ 250 words.\n`;
}

function buildPromptBeta(focus) {
  return `Review the source file in src/ via \`/codex-review\` with adversarial framing: "find bugs that follow from the semantics, not surface issues. Look specifically at: **${focus}**". Combine Codex's findings with your own.\n\nEnd with a fenced \`\`\`json block:\n\n\`\`\`json\n{\n  "issues": [\n    {"category": "bug" | "design" | "performance" | "security" | "other",\n     "severity": "high" | "medium" | "low",\n     "summary": "<≤30 words>"}\n  ],\n  "total_issues_found": <int>,\n  "codex_consulted": true\n}\n\`\`\`\n\nProse ≤ 250 words.\n`;
}

function buildOracle(p) {
  return {
    scenario: p.id,
    notes: `Real codebase extract — ${p.dst}, focus: ${p.focus}`,
    criteria: [
      { name: 'issues_min_3', type: 'final_json_array_min', args: { field: 'issues', min: 3 } },
      { name: 'issues_max_5', type: 'final_json_array_max', args: { field: 'issues', max: 5 } },
      { name: 'total_field', type: 'final_json_field', args: { field: 'total_issues_found' } },
      { name: 'mentions_focus_keyword', type: 'contains_text', args: { needle: p.focus.split(' ')[0] } },
      { name: 'has_severity', type: 'contains_text', args: { needle: 'severity' } },
      { name: 'beta_codex_called', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  };
}

let created = 0, skipped = 0;
for (const e of EXTRACTS) {
  const scenDir = path.join(here, e.id);
  if (fs.existsSync(scenDir)) { console.log(`SKIP ${e.id}: exists`); skipped++; continue; }
  if (!fs.existsSync(e.src)) { console.log(`SKIP ${e.id}: source not found: ${e.src}`); skipped++; continue; }

  fs.mkdirSync(path.join(scenDir, 'src'), { recursive: true });

  // Copy source (optionally slice)
  let content = fs.readFileSync(e.src, 'utf8');
  if (e.slice_start || e.slice_end) {
    const lines = content.split('\n');
    content = lines.slice((e.slice_start || 1) - 1, e.slice_end || lines.length).join('\n');
  }
  // Redact common secrets defensively
  content = content.replace(/(['"]?(?:api[_-]?key|token|password|secret)['"]?\s*[:=]\s*['"])[^'"]+(['"])/gi, '$1REDACTED$2');
  fs.writeFileSync(path.join(scenDir, 'src', e.dst), content);

  // meta.json
  const meta = {
    id: e.id, template: 'R', category: e.category,
    hypothesis_target: 'NEW_real_codebase',
    source: { path: e.src.replace(/^\/Users\/lanco/, '~'), focus: e.focus },
    params: { task: e.task, focus: e.focus },
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(scenDir, 'meta.json'), JSON.stringify(meta, null, 2));

  fs.writeFileSync(path.join(scenDir, 'PROMPT.alpha.md'), buildPromptAlpha(e.focus));
  fs.writeFileSync(path.join(scenDir, 'PROMPT.beta.md'), buildPromptBeta(e.focus));
  fs.writeFileSync(path.join(scenDir, 'ORACLE.json'), JSON.stringify(buildOracle(e), null, 2));

  console.log(`✓ ${e.id}: ${e.dst} (${content.split('\n').length} LOC)`);
  created++;
}
console.log(`\nCreated ${created}, skipped ${skipped}`);
