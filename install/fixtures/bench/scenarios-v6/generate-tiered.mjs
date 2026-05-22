#!/usr/bin/env node
// generate-tiered.mjs — Generate v6 T11-T15 scenarios with α-partial-fail dial.

import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const tmplDir = path.join(here, '_templates');
const templates = fs.readdirSync(tmplDir).filter((f) => f.startsWith('T1') && f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(tmplDir, f), 'utf8')));

let created = 0;
for (const T of templates) {
  console.log(`=== ${T.id} ${T.name} ===`);
  for (const p of T.param_combos) {
    const scenDir = path.join(here, p.id);
    if (fs.existsSync(scenDir)) { console.log(`  ${p.id}: SKIP exists`); continue; }
    fs.mkdirSync(path.join(scenDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(scenDir, 'meta.json'), JSON.stringify({
      id: p.id, template: T.id, category: T.category,
      hypothesis_target: T.hypothesis_target, params: p,
      generated_at: new Date().toISOString(),
    }, null, 2));
    if (T.id === 'T11') generateT11(scenDir, p);
    else if (T.id === 'T12') generateT12(scenDir, p);
    else if (T.id === 'T13') generateT13(scenDir, p);
    else if (T.id === 'T14') generateT14(scenDir, p);
    else if (T.id === 'T15') generateT15(scenDir, p);
    console.log(`  ${p.id}: ✓ (α target ${p.alpha_target_pct}%)`);
    created++;
  }
}
console.log(`\nCreated ${created} v6 tiered scenarios.`);

function camel(s) { return s.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase()); }

function generateT11(dir, p) {
  fs.writeFileSync(path.join(dir, 'src', `${p.module}.js`),
    `// ${p.module}.js\nclass ${camel(p.module)} {\n  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }\n  do(arg) { return arg; }\n  reset() { this.state.clear(); }\n}\nmodule.exports = { ${camel(p.module)} };\n`);
  const guidance = { all: 'MUST include: ## Description, ## How to invoke, ## Guardrails, ## MUST procedures, ## Edge cases', most: 'Include: description, usage, guardrails. Plus essentials.', half: 'Document thoroughly.', few: 'Document the module.', none: 'Write good documentation.' };
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Read \`src/${p.module}.js\` and author SKILL.md-style documentation. ${guidance[p.explicit_sections]}\n\nEnd with \`\`\`json:\n{ "sections": ["..."], "word_count": <int> }\n\nProse ≤ 600 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Read \`src/${p.module}.js\` and author doc via TWO-ROUND self-review: 1) draft 2) /codex-review for gaps 3) revise 4) /codex-followup for final check.\n\n${guidance[p.explicit_sections]}\n\nEnd with: { "sections": ["..."], "word_count": <int>, "review_rounds": 2 }\n\nProse ≤ 600 words.\n`);
  const allSections = ['Description', 'How to invoke', 'Guardrails', 'MUST procedures', 'Edge cases'];
  const reqSections = allSections.slice(0, Math.min(p.n_criteria - 2, 5));
  const criteria = [
    { name: 'json_sections_field', type: 'final_json_field', args: { field: 'sections' } },
    { name: 'word_count_max', type: 'word_count_max', args: { max: 700 } },
    ...reqSections.map((s) => ({ name: `has_${s.toLowerCase().replace(/\s/g, '_')}`, type: 'doc_section_exists', args: { sections: [s] } })),
  ];
  if (p.n_criteria >= 8) criteria.push({ name: 'mentions_state', type: 'contains_text', args: { needle: 'state' } });
  if (p.n_criteria >= 9) criteria.push({ name: 'mentions_constructor', type: 'contains_text', args: { needle: 'constructor' } });
  if (p.n_criteria >= 10) criteria.push({ name: 'mentions_reset', type: 'contains_text', args: { needle: 'reset' } });
  if (p.n_criteria >= 11) criteria.push({ name: 'mentions_thread_safety', type: 'contains_text', args: { needle: 'thread' } });
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({ scenario: p.id, notes: `T11 α-fail-dial — ${p.module}, target=${p.alpha_target_pct}%`, criteria }, null, 2));
}

function generateT12(dir, p) {
  const codes = {
    'obvious_typo': `function check(x) { reutrn x === 'ok'; }`,
    'timing_attack': `const ADMIN_TOKEN = 'secret';\nfunction checkAdmin(token) { return token === ADMIN_TOKEN; }`,
    'embedded_quote': `function parse(line) { return line.split(','); /* doesn't handle "" */ }`,
    'tocttou_in_lock': `function readData() { const d = global.data; setTimeout(()=>{}, 100); return d; }`,
    'recency_not_refreshed_on_set': `class LRU { constructor(cap){ this.cap=cap; this.map=new Map(); } set(k,v){ if(this.map.size>=this.cap)this.map.delete(this.map.keys().next().value); this.map.set(k,v); } get(k){return this.map.get(k);} }`,
  };
  let final = codes[p.subtle_bug] || `// ${p.subtle_bug}\n`;
  for (let i = 0; i < p.decoys; i++) final += `\n// Decoy ${i+1}\nfunction decoy${i}() {}\n`;
  fs.writeFileSync(path.join(dir, 'src', `code.js`), final);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review src/code.js for critical bugs. Identify the most serious issue.\n\nEnd with: { "critical_issue": "<≤30 words>", "category": "<type>", "line_hint": <int> }\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Adversarial review of src/code.js via /codex-review with framing: "find subtle bugs that follow from semantics, not surface". Look specifically for ${p.subtle_bug}.\n\nEnd with: { "critical_issue": "<≤30 words>", "category": "${p.subtle_bug}" | "other", "line_hint": <int>, "codex_consulted": true }\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T12 α-fail-dial — bug=${p.subtle_bug}, decoys=${p.decoys}, α target=${p.alpha_target_pct}%`,
    criteria: [
      { name: 'category_matches', type: 'final_json_field', args: { field: 'category', equals: p.subtle_bug } },
      { name: 'critical_issue_present', type: 'final_json_field', args: { field: 'critical_issue' } },
      { name: 'line_hint_present', type: 'final_json_field', args: { field: 'line_hint' } },
      { name: 'mentions_bug_class', type: 'contains_text', args: { needle: p.subtle_bug.split('_')[0] } },
      { name: 'beta_codex_called', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

function generateT13(dir, p) {
  const probs = {
    '1-color-graph': { md: 'Color 3 vertices (edge {0,1}) with 1 color (any).\n```json\n{ "coloring": ["A","A","A"], "valid": true }\n```', schema: '"coloring": [...], "valid": true' },
    '2-color-graph': { md: 'Color cycle {(0,1),(1,2),(2,3),(3,0)} with 2 colors.\n```json\n{ "coloring": ["A","B","A","B"], "valid": true }\n```', schema: '"coloring": [...], "valid": true' },
    '3-color-w-forbid': { md: 'Color 5-vertex graph (cycle + chord 0-2) with 3 colors. Vertex 0 = A.\n```json\n{ "coloring": [...], "valid": true }\n```', schema: '"coloring": [...], "valid": true' },
    'interval-sched-w-priority': { md: 'Schedule [(1,3,p2),(2,5,p1),(4,6,p3),(5,8,p1),(7,9,p2)] for max priority non-overlap.\n```json\n{ "selected": [...], "total_priority": <int> }\n```', schema: '"selected": [...], "total_priority": <int>' },
    'queens-4stack-w-color': { md: '6 queens 8x8 + 4 stacked + color rule (≤2 queens with (r+c)%3==0).\n```json\n{ "queens": [[r,c]×6], "verifications": {"all_constraints_met": true} }\n```', schema: '"queens": [...], "verifications": {...}' },
  };
  const prob = probs[p.problem] || { md: `# ${p.problem}\nSolve.`, schema: '"answer": "..."' };
  fs.writeFileSync(path.join(dir, 'src', 'problem.md'), prob.md);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Solve src/problem.md and verify constraints.\n\nEnd with: { ${prob.schema} }\n\nProse ≤ 400 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Solve src/problem.md via mcp__codex__codex with reasoning=high. Codex enumerates constraints first.\n\nEnd with: { ${prob.schema}, "codex_consulted": true, "reasoning_level": "high" }\n\nProse ≤ 400 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T13 α-fail-dial — ${p.problem}, constraints=${p.constraints}, α=${p.alpha_target_pct}%`,
    criteria: [
      { name: 'mentions_constraint', type: 'contains_text', args: { needle: 'constraint' } },
      { name: 'mentions_verify', type: 'contains_text', args: { needle: 'verif' } },
      { name: 'mentions_problem_term', type: 'contains_text', args: { needle: p.problem.split('-')[0] } },
      { name: 'beta_codex_called', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

function generateT14(dir, p) {
  for (let i = 1; i <= p.n_files; i++) {
    fs.writeFileSync(path.join(dir, 'src', `${p.domain}-${i}.md`),
      `# ${p.domain}-${i}\n\n## Purpose\nComponent ${i} of ${p.domain}.\n\n## API\nOperations for ${p.domain}.\n\n## Dependencies\n${i > 1 ? `Depends on ${p.domain}-${i-1}` : 'No deps'}.\n${p.implicit_required >= 1 ? `\n## Hidden\nImplicit: needs ${p.domain.split('-')[0]}-context init.\n` : ''}${p.implicit_required >= 2 ? `\n## Errors\nFails silently on missing config.\n` : ''}${p.implicit_required >= 3 ? `\n## SLA\nNo retry on partial failure.\n` : ''}`);
  }
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Synthesize all ${p.n_files} files in src/. Cover components, dependencies, ${p.implicit_required >= 1 ? 'implicit invariants, ' : ''}top 3 risks.\n\nEnd with: { "components": [...], "dependencies": [...], "top_risks": [...] }\n\nProse ≤ 500 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Synthesize ${p.n_files} files in src/ via SINGLE /codex-review (avoid multi-step chain).\n\nEnd with: { "components": [...], "dependencies": [...], "top_risks": [...], "codex_consulted": true }\n\nProse ≤ 500 words.\n`);
  const criteria = [
    { name: 'components_min', type: 'final_json_array_min', args: { field: 'components', min: Math.floor(p.n_files * 0.7) } },
    { name: 'dependencies_present', type: 'final_json_array_min', args: { field: 'dependencies', min: 1 } },
    { name: 'top_risks_3', type: 'final_json_array_min', args: { field: 'top_risks', min: 3 } },
    { name: 'mentions_domain', type: 'contains_text', args: { needle: p.domain.split('-')[0] } },
  ];
  if (p.implicit_required >= 1) criteria.push({ name: 'mentions_invariant', type: 'contains_text', args: { needle: 'invariant' } });
  if (p.implicit_required >= 2) criteria.push({ name: 'mentions_silent', type: 'contains_text', args: { needle: 'silent' } });
  if (p.implicit_required >= 3) criteria.push({ name: 'mentions_retry', type: 'contains_text', args: { needle: 'retry' } });
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({ scenario: p.id, notes: `T14 α-fail-dial — ${p.domain}, n_files=${p.n_files}, implicit=${p.implicit_required}, α=${p.alpha_target_pct}%`, criteria }, null, 2));
}

function generateT15(dir, p) {
  const moduleName = p.module.split('-')[0];
  fs.writeFileSync(path.join(dir, 'src', 'spec.md'),
    `# Spec — ${p.module}\n\nImplement ${moduleName}.\n\n## Explicit edge cases\n${Array.from({ length: p.explicit_edges }, (_, i) => `${i + 1}. Edge ${i + 1}`).join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'src', `${moduleName}.test.js`),
    `function assert(c, n) { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exit(1); }\n// tests\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Implement src/${moduleName}.js per src/spec.md to pass tests. Add ${p.explicit_edges} edge case tests.\n\nEnd with: { "tests_pass": true, "tests_added": ${p.explicit_edges}, "implementation_lines": <int> }\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `TDD chain: /codex-fix to implement → /codex-followup to find ${p.hidden_edges} HIDDEN edge cases the spec misses.\n\nEnd with: { "tests_pass": true, "tests_added": ${p.explicit_edges + p.hidden_edges}, "implementation_lines": <int>, "hidden_cases_found": <int> }\n`);
  const criteria = [
    { name: 'tests_pass_json', type: 'final_json_field', args: { field: 'tests_pass', equals: true } },
    { name: 'tests_added_field', type: 'final_json_field', args: { field: 'tests_added' } },
    { name: 'mentions_edge', type: 'contains_text', args: { needle: 'edge' } },
  ];
  if (p.hidden_edges >= 2) criteria.push({ name: 'beta_finds_hidden', type: 'arm_specific', args: { arm: 'beta', inner_type: 'final_json_field', inner_args: { field: 'hidden_cases_found' } } });
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({ scenario: p.id, notes: `T15 α-fail-dial — ${p.module}, explicit=${p.explicit_edges}, hidden=${p.hidden_edges}, α=${p.alpha_target_pct}%`, criteria }, null, 2));
}
