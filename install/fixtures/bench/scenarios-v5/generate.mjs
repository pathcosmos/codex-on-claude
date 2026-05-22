#!/usr/bin/env node
// generate.mjs — Read T0X templates and create 50 scenario directories with PROMPT + ORACLE + src.
// Usage: node generate.mjs [--templates=T01,T02,...] [--dry-run]
//
// Output: install/fixtures/bench/scenarios-v5/<id>/{meta.json,PROMPT.alpha.md,PROMPT.beta.md,ORACLE.json,src/}

import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filterFlag = args.find((a) => a.startsWith('--templates='));
const filter = filterFlag ? filterFlag.split('=')[1].split(',') : null;

const tmplDir = path.join(here, '_templates');
const templates = fs.readdirSync(tmplDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(tmplDir, f), 'utf8')))
  .filter((t) => !filter || filter.includes(t.id));

let created = 0;
for (const T of templates) {
  console.log(`\n=== ${T.id} ${T.name} (${T.category}) — ${T.param_combos.length} scenarios ===`);
  for (const params of T.param_combos) {
    const scenDir = path.join(here, params.id);
    if (fs.existsSync(scenDir)) {
      console.log(`  ${params.id}: SKIP (exists)`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${params.id}: DRY-RUN would create`);
      continue;
    }
    fs.mkdirSync(scenDir, { recursive: true });
    fs.mkdirSync(path.join(scenDir, 'src'), { recursive: true });

    // meta.json
    fs.writeFileSync(path.join(scenDir, 'meta.json'), JSON.stringify({
      id: params.id, template: T.id, category: T.category,
      hypothesis_target: T.hypothesis_target, params,
      generated_at: new Date().toISOString(),
    }, null, 2));

    // Generate per-template content
    if (T.id === 'T01') generateT01(scenDir, params);
    else if (T.id === 'T02') generateT02(scenDir, params);
    else if (T.id === 'T03') generateT03(scenDir, params);
    else if (T.id === 'T04') generateT04(scenDir, params);
    else if (T.id === 'T05') generateT05(scenDir, params);
    else if (T.id === 'T06') generateT06(scenDir, params);
    else if (T.id === 'T07') generateT07(scenDir, params);
    else if (T.id === 'T08') generateT08(scenDir, params);
    else if (T.id === 'T09') generateT09(scenDir, params);
    else if (T.id === 'T10') generateT10(scenDir, params);

    console.log(`  ${params.id}: ✓`);
    created++;
  }
}
console.log(`\nCreated ${created} scenarios.`);

// =========== T01 — self-review doc authoring ===========
function generateT01(dir, p) {
  const langExt = { js: 'js', py: 'py', go: 'go', rs: 'rs', java: 'java', ts: 'ts' }[p.lang];
  const codeFn = {
    js: () => `// ${p.module}.js — ${p.module} implementation (${p.loc} LOC target)\nclass ${camel(p.module)} {\n  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }\n  ${pubMethods(p.module).map((m) => `${m}(arg) { return arg; }`).join('\n  ')}\n}\nmodule.exports = { ${camel(p.module)} };\n`,
    py: () => `# ${p.module}.py — ${p.module} implementation\nclass ${camel(p.module)}:\n    def __init__(self, **opts):\n        self.opts = opts\n        self.state = {}\n${pubMethods(p.module).map((m) => `    def ${m}(self, arg):\n        return arg`).join('\n')}\n`,
    go: () => `// ${p.module}.go — ${p.module}\npackage ${p.module.replace(/-/g, '')}\n\ntype ${camel(p.module)} struct {\n  opts map[string]interface{}\n}\n\nfunc New() *${camel(p.module)} { return &${camel(p.module)}{} }\n${pubMethods(p.module).map((m) => `func (r *${camel(p.module)}) ${capitalize(m)}(arg interface{}) interface{} { return arg }`).join('\n')}\n`,
    rs: () => `// ${p.module}.rs\npub struct ${camel(p.module)} { opts: std::collections::HashMap<String, String> }\nimpl ${camel(p.module)} {\n  pub fn new() -> Self { Self { opts: Default::default() } }\n${pubMethods(p.module).map((m) => `  pub fn ${m.replace(/-/g, '_')}(&self, arg: &str) -> String { arg.to_string() }`).join('\n')}\n}\n`,
    java: () => `// ${camel(p.module)}.java\npublic class ${camel(p.module)} {\n  private final java.util.Map<String, Object> opts = new java.util.HashMap<>();\n${pubMethods(p.module).map((m) => `  public Object ${capitalize(m)}(Object arg) { return arg; }`).join('\n')}\n}\n`,
    ts: () => `// ${p.module}.ts\nexport class ${camel(p.module)} {\n  constructor(public opts: any = {}) {}\n${pubMethods(p.module).map((m) => `  ${m}(arg: any): any { return arg; }`).join('\n')}\n}\n`,
  }[p.lang];
  fs.writeFileSync(path.join(dir, 'src', `${p.module}.${langExt}`), codeFn());

  // PROMPTS
  const sections = ['Description', 'How to invoke', 'Guardrails', 'MUST procedures', 'Edge cases'].slice(0, p.sections);
  const sectionList = sections.map((s) => `\`## ${s}\``).join(', ');

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Read the ${p.lang.toUpperCase()} module \`src/${p.module}.${langExt}\`. Author a complete SKILL.md-style document covering ${sections.length} sections: ${sectionList}.\n\nEnd with a fenced \`\`\`json block:\n\n\`\`\`json\n{ "sections_authored": [${sections.map((s) => `"${s}"`).join(', ')}], "word_count": <int> }\n\`\`\`\n\nNo TBD/TODO placeholders. Prose ≤ 600 words.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Author the SKILL.md doc for \`src/${p.module}.${langExt}\` via TWO-ROUND self-review:\n\n1. Write first draft with ${sections.length} sections: ${sectionList}.\n2. Call \`/codex-review\` to identify missing edge cases or unclear wording. Capture thread ID.\n3. Revise based on findings.\n4. Call \`/codex-followup\` on same thread to confirm no remaining issues.\n\nEnd with: \`\`\`json\n{ "sections_authored": [${sections.map((s) => `"${s}"`).join(', ')}], "word_count": <int>, "review_rounds": 2 }\n\`\`\`\n\nProse ≤ 600 words.\n`);

  // ORACLE
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T01 self-review doc — ${p.module}/${p.lang}, ${sections.length} sections`,
    criteria: [
      { name: 'has_all_sections', type: 'doc_section_exists', args: { sections } },
      { name: 'no_tbd', type: 'not_contains_text', args: { needle: 'TBD' } },
      { name: 'no_todo', type: 'not_contains_text', args: { needle: 'TODO' } },
      { name: 'json_sections_field', type: 'final_json_array_min', args: { field: 'sections_authored', min: sections.length } },
      { name: 'word_count_under_700', type: 'word_count_max', args: { max: 700 } },
      { name: 'mentions_module', type: 'contains_text', args: { needle: p.module.split('-')[0] } },
      { name: 'beta_invoked_codex_twice', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 2 } } },
    ],
  }, null, 2));
}

// =========== T02 — adversarial review ===========
function generateT02(dir, p) {
  const langExt = { js: 'js', py: 'py', go: 'go', ts: 'ts', java: 'java' }[p.lang];
  // Generate code with planted subtle bug
  const code = subtleBugCode(p.domain, p.subtle_bug, p.lang, p.decoys);
  fs.writeFileSync(path.join(dir, 'src', `code.${langExt}`), code);

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review the ${p.lang.toUpperCase()} code in \`src/code.${langExt}\`. There is at least 1 subtle correctness or security bug. Identify the most critical issue.\n\nEnd with a fenced \`\`\`json block:\n\n\`\`\`json\n{ "critical_issue": "<≤30 words>", "category": "${p.subtle_bug}" | "other", "line_hint": <int> }\n\`\`\`\n\nProse ≤ 250 words.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Adversarial review of \`src/code.${langExt}\`. Call \`/codex-review\` with this EXPLICIT framing: "Find subtle correctness bugs that follow from the code semantics, not just surface issues. Look for ${p.subtle_bug}-class problems specifically."\n\nEnd with: \`\`\`json\n{ "critical_issue": "<≤30 words>", "category": "${p.subtle_bug}" | "other", "line_hint": <int>, "codex_consulted": true }\n\`\`\`\n\nProse ≤ 250 words.\n`);

  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T02 adversarial — ${p.domain} bug=${p.subtle_bug}, decoys=${p.decoys}`,
    criteria: [
      { name: 'category_matches', type: 'final_json_field', args: { field: 'category', equals: p.subtle_bug } },
      { name: 'critical_issue_present', type: 'final_json_field', args: { field: 'critical_issue' } },
      { name: 'mentions_bug_class', type: 'contains_text', args: { needle: p.subtle_bug.split('_')[0] } },
      { name: 'line_hint_present', type: 'final_json_field', args: { field: 'line_hint' } },
      { name: 'beta_called_codex', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T03 — catastrophe synthesis ===========
function generateT03(dir, p) {
  // Generate N files in src/
  for (let i = 1; i <= p.n_files; i++) {
    fs.writeFileSync(path.join(dir, 'src', `${p.domain}-${i}.md`),
      `# Module ${i} of ${p.domain}\n\n## Purpose\n${p.domain} component #${i}.\n\n## API\nProvides ${randomVerbs()} operations.\n\n## Dependencies\nDepends on modules ${randomDeps(p.n_files, i)}.\n\n## Status\nOperational. Known issues: ${randomIssues(2).join(', ')}.\n`);
  }

  const schema = `{ "modules": ["module-1", ..., "module-${p.n_files}"], "dependencies": [{"from": "<m>", "to": "<m>"}, ...], "top_risks": ["...", "...", "..."], "synthesis_done": true }`;

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Read all ${p.n_files} markdown files in src/. Synthesize into a unified overview covering: module purposes, dependency graph, cross-cutting concerns, top 3 risks.\n\nEnd with fenced \`\`\`json: ${schema}\n\nProse ≤ 500 words.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Synthesize ${p.n_files} *${p.domain}-*.md* files into a unified overview via this ${p.chain}-step chain:\n\n${Array.from({ length: p.chain }, (_, i) => `${i + 1}. Step ${i + 1}: ${i === 0 ? `Delegate file reading to ${p.subagent ? '\`codex-reviewer\` subagent' : '\`/codex-review\`'}` : `Refine prior step's output`}`).join('\n')}\n\nEnd with fenced \`\`\`json: ${schema} + "chain_steps": ${p.chain}\n\nProse ≤ 500 words.\n`);

  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T03 catastrophe candidate — n_files=${p.n_files}, chain=${p.chain}, strict=${p.strict}, subagent=${p.subagent}`,
    criteria: [
      { name: 'modules_min', type: 'final_json_array_min', args: { field: 'modules', min: Math.floor(p.n_files * 0.8) } },
      { name: 'dependencies_present', type: 'final_json_array_min', args: { field: 'dependencies', min: Math.floor(p.n_files / 2) } },
      { name: 'top_risks_3', type: 'final_json_array_min', args: { field: 'top_risks', min: 3 } },
      { name: 'synthesis_done', type: 'final_json_field', args: { field: 'synthesis_done', equals: true } },
      { name: 'mentions_domain', type: 'contains_text', args: { needle: p.domain.split('-')[0] } },
      { name: 'beta_chain_executed', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T04 — hard reasoning ===========
function generateT04(dir, p) {
  const problemDesc = hardReasoningProblem(p.problem, p.size, p.constraints);
  fs.writeFileSync(path.join(dir, 'src', 'problem.md'), problemDesc.md);

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Solve the problem in \`src/problem.md\`. Show brief reasoning, then emit the answer as fenced \`\`\`json:\n\n\`\`\`json\n${problemDesc.schema}\n\`\`\`\n\nProse ≤ 400 words.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Solve the problem in \`src/problem.md\`. Invoke \`mcp__codex__codex\` with \`sandbox=read-only\`, \`approval-policy=never\`, and \`reasoning=high\`. Ask Codex to enumerate the problem step-by-step before solving.\n\nUse Codex's answer + your own verification.\n\nEnd with: \`\`\`json\n${problemDesc.schema}, "codex_consulted": true, "reasoning_level": "high" }\n\`\`\` (close brace).\n\nProse ≤ 400 words.\n`);

  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T04 reasoning — ${p.problem}/${p.size}, constraints=${p.constraints}`,
    criteria: [
      { name: 'answer_field_present', type: 'final_json_field', args: { field: problemDesc.answer_field } },
      { name: 'mentions_problem', type: 'contains_text', args: { needle: p.problem.split('-')[0] } },
      { name: 'mentions_reasoning', type: 'contains_text', args: { needle: 'constraint' } },
      { name: 'beta_used_codex', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T05 — TDD followup ===========
function generateT05(dir, p) {
  const langExt = { js: 'js', py: 'py', ts: 'ts', go: 'go', rs: 'rs' }[p.lang];
  fs.writeFileSync(path.join(dir, 'src', `${p.module}.test.${langExt}`), tddTestSkeleton(p.module, p.lang));
  fs.writeFileSync(path.join(dir, 'src', `spec.md`), `# Spec — ${p.module}\n\nImplement \`${p.module}\` module with standard operations.\nMust pass the failing tests in \`${p.module}.test.${langExt}\`.\n\nExpected edge cases: ${p.edge_cases} additional cases beyond the base spec.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Read \`src/spec.md\` and \`src/${p.module}.test.${langExt}\`. Implement \`src/${p.module}.${langExt}\` to pass all tests. Then add ${p.edge_cases} additional edge case tests to the test file.\n\nEnd with: \`\`\`json\n{ "tests_pass": true, "tests_added": ${p.edge_cases}, "implementation_lines": <int> }\n\`\`\`\n\nProse ≤ 250 words.\n`);

  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `TDD via Codex chain:\n\n1. \`/codex-fix\` to implement \`${p.module}.${langExt}\` to pass all tests. Capture thread ID.\n2. \`/codex-followup\` on same thread: "what ${p.edge_cases} edge cases am I missing?"\n3. Add Codex-suggested cases to the test file.\n4. Verify tests pass.\n\nEnd with: \`\`\`json\n{ "tests_pass": true, "tests_added": ${p.edge_cases}, "implementation_lines": <int>, "codex_thread_id": "<uuid>", "edge_cases_from_codex": [...] }\n\`\`\`\n`);

  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T05 TDD — ${p.module}/${p.lang}, edge_cases=${p.edge_cases}`,
    criteria: [
      { name: 'tests_pass_json', type: 'final_json_field', args: { field: 'tests_pass', equals: true } },
      { name: 'tests_added_field', type: 'final_json_field', args: { field: 'tests_added' } },
      { name: 'implementation_lines_present', type: 'final_json_field', args: { field: 'implementation_lines' } },
      { name: 'mentions_module', type: 'contains_text', args: { needle: p.module.split('-')[0] } },
      { name: 'beta_codex_chain', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T06 — subagent delegation (long-context) ===========
function generateT06(dir, p) {
  const ext = { 'code-modules': 'js', 'access-logs': 'log', 'config-files': 'yaml', 'markdown-corpus': 'md', 'yaml-manifests': 'yaml', 'error-logs': 'log', 'test-files': 'js', 'api-specs': 'yaml', 'schema-files': 'json', 'monitoring-dashboards': 'json' }[p.input_kind] || 'txt';
  const fileGen = {
    'code-modules': (i) => `// module${i}.js\nclass M${i} {\n  do() { return 'module-${i}'; }\n}\n${'// padding line\n'.repeat(Math.floor(p.kb_per_file * 30))}module.exports = M${i};\n`,
    'access-logs': (i) => Array.from({ length: Math.floor(p.kb_per_file * 25) }, (_, j) => `2026-05-21T${String(j % 24).padStart(2, '0')}:00:00Z GET /api/v1/users/${j} status=200 latency_ms=${20 + (j % 200)}`).join('\n'),
    'config-files': (i) => `service:\n  name: svc-${i}\n  port: ${3000 + i}\n  replicas: ${2 + i}\n${Array.from({ length: Math.floor(p.kb_per_file * 30) }, (_, j) => `  param-${j}: value-${j}`).join('\n')}\n`,
    'markdown-corpus': (i) => `# Doc ${i}\n\n## Overview\nDocument ${i} content.\n\n${'Section paragraph here.\n\n'.repeat(Math.floor(p.kb_per_file * 30))}`,
    'yaml-manifests': (i) => `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm-${i}\ndata:\n${Array.from({ length: Math.floor(p.kb_per_file * 30) }, (_, j) => `  key-${j}: value-${j}`).join('\n')}\n`,
    'error-logs': (i) => Array.from({ length: Math.floor(p.kb_per_file * 25) }, (_, j) => `ERROR ${j} svc-${i % 3}: ${['timeout', 'connection reset', 'parse error', 'auth failed'][j % 4]} at line ${j * 10}`).join('\n'),
    'test-files': (i) => `// test${i}.js\ntest('case ${i}-1', () => { expect(1).toBe(1); });\n${"test('pad', () => { expect(true).toBe(true); });\n".repeat(Math.floor(p.kb_per_file * 25))}`,
    'api-specs': (i) => `openapi: 3.0.0\ninfo:\n  title: svc-${i}\npaths:\n${Array.from({ length: Math.floor(p.kb_per_file * 20) }, (_, j) => `  /endpoint-${j}:\n    get:\n      summary: endpoint ${j}\n      responses:\n        '200':\n          description: ok`).join('\n')}\n`,
    'schema-files': (i) => JSON.stringify({ name: `schema-${i}`, fields: Array.from({ length: Math.floor(p.kb_per_file * 30) }, (_, j) => ({ name: `field-${j}`, type: ['string', 'number', 'bool'][j % 3] })) }, null, 2),
    'monitoring-dashboards': (i) => JSON.stringify({ id: i, panels: Array.from({ length: Math.floor(p.kb_per_file * 20) }, (_, j) => ({ id: j, title: `panel-${j}`, query: `metric_${j}{label='x'}` })) }, null, 2),
  }[p.input_kind] || ((i) => `content for ${p.input_kind} #${i}\n`);
  for (let i = 1; i <= p.n_files; i++) {
    fs.writeFileSync(path.join(dir, 'src', `${p.input_kind}-${i}.${ext}`), fileGen(i));
  }
  const totalKB = p.n_files * p.kb_per_file;
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Analyze all ${p.n_files} files (~${totalKB}KB total) in src/. Identify the top 3 issues, anomalies, or opportunities for improvement.\n\nEnd with: \`\`\`json\n{ "issues": [{"file": "<name>", "category": "<type>", "summary": "<≤25 words>"}, ...], "files_analyzed": ${p.n_files} }\n\`\`\`\n\nProse ≤ 350 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Analyze ${p.n_files} files (~${totalKB}KB total) in src/. Delegate the analysis to the \`codex-reviewer\` subagent (or invoke \`mcp__codex__codex\` with sandbox=read-only). Do NOT read all files into your main context yourself.\n\nReceive summary + reformat into:\n\n\`\`\`json\n{ "issues": [{"file": "<name>", "category": "<type>", "summary": "<≤25 words>"}, ...], "files_analyzed": ${p.n_files}, "delegated_to": "codex-reviewer" | "mcp__codex__codex" }\n\`\`\`\n\nProse ≤ 350 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T06 subagent — ${p.input_kind} × ${p.n_files}, ~${totalKB}KB, strict=${p.strict}`,
    criteria: [
      { name: 'issues_min_3', type: 'final_json_array_min', args: { field: 'issues', min: 3 } },
      { name: 'files_analyzed_field', type: 'final_json_field', args: { field: 'files_analyzed' } },
      { name: 'mentions_input_kind', type: 'contains_text', args: { needle: p.input_kind.split('-')[0] } },
      { name: 'beta_main_protected', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_response_size_p95_max', inner_args: { max_chars: totalKB > 30 ? 20000 : 50000 } } },
      { name: 'beta_delegated_field', type: 'arm_specific', args: { arm: 'beta', inner_type: 'final_json_field', inner_args: { field: 'delegated_to' } } },
    ],
  }, null, 2));
}

// =========== T07 — ceiling baseline ===========
function generateT07(dir, p) {
  const ext = { js: 'js', py: 'py', go: 'go', ts: 'ts', md: 'md', json: 'json' }[p.lang] || 'txt';
  const code = {
    'find-syntax-error': `function foo() { return 1 } function bar( {} // syntax error here in line 2: missing closing paren`,
    'spot-typo': `# Heading\n\nTehy went to the store. The end.`,
    'identify-unused-import': `import os\nimport sys\nimport json\n\ndef main():\n    print(os.path.join('a','b'))\n# json is unused`,
    'list-public-functions': `package main\n\nfunc Add(a, b int) int { return a+b }\nfunc Sub(a, b int) int { return a-b }\nfunc privateHelper() {}\nfunc Mul(a, b int) int { return a*b }`,
    'extract-constants': `const MAX_RETRY = 3;\nconst BASE_DELAY = 100;\nlet count = 0;\nconst PI = 3.14159;`,
    'count-functions': `def f1(): pass\ndef f2(): pass\nclass C:\n    def m1(self): pass\n    def m2(self): pass\ndef f3(): pass`,
    'find-todo-comments': `// TODO: optimize this loop\nfunction process() { /* TODO handle errors */ }\n// FIXME later\n// TODO: add tests`,
    'rename-variable': `def calculate(x):\n    temp_value = x * 2\n    temp_value += 10\n    return temp_value`,
    'format-json-output': `{"name":"test","values":[1,2,3],"nested":{"a":1,"b":2}}`,
    'list-dependencies': `{"dependencies":{"express":"^4.18","lodash":"^4.17"},"devDependencies":{"jest":"^29"}}`,
  }[p.task] || `// trivial code for ${p.task}\n`;
  fs.writeFileSync(path.join(dir, 'src', `task.${ext}`), code);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Read \`src/task.${ext}\` and perform the task: **${p.task.replace(/-/g, ' ')}**.\n\nEnd with: \`\`\`json\n{ "answer": "...", "task": "${p.task}" }\n\`\`\`\n\nProse ≤ 100 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Read \`src/task.${ext}\` and perform: **${p.task.replace(/-/g, ' ')}**. You MAY call \`/codex-review\` if uncertain, but for trivial tasks just answer directly.\n\nEnd with: \`\`\`json\n{ "answer": "...", "task": "${p.task}", "codex_called": <bool> }\n\`\`\`\n\nProse ≤ 100 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T07 ceiling baseline — ${p.task}/${p.lang}`,
    criteria: [
      { name: 'answer_field', type: 'final_json_field', args: { field: 'answer' } },
      { name: 'task_field', type: 'final_json_field', args: { field: 'task', equals: p.task } },
      { name: 'mentions_task_keyword', type: 'contains_text', args: { needle: p.task.split('-')[0] } },
    ],
  }, null, 2));
}

// =========== T08 — i18n / l10n ===========
function generateT08(dir, p) {
  const ext = { js: 'js', py: 'py', ts: 'ts', java: 'java', go: 'go', html: 'html' }[p.lang] || 'txt';
  const codeSamples = {
    'hardcoded-strings': `// UI strings hardcoded\nconst MSG_WELCOME = "Welcome";\nconst MSG_ERROR = "An error occurred";\nfunction render(){ return MSG_WELCOME + ", " + "User" + "!"; }`,
    'date-format-locale': `from datetime import datetime\nd = datetime.now()\n# Uses default locale, breaks across locales\nprint(d.strftime("%m/%d/%Y"))`,
    'currency-locale': `function formatPrice(amount: number): string { return '$' + amount.toFixed(2); }`,
    'plural-rules': `function msg(n) { return n === 1 ? '1 item' : n + ' items'; } // breaks for Slavic/Arabic plurals`,
    'rtl-direction': `<div><span>Hello</span><span>아랍어</span></div>`,
    'tolower-locale': `String x = name.toLowerCase(); // Turkish locale: I → i-without-dot, breaks ASCII assumption`,
    'number-format': `def format_num(n): return f"{n:,.2f}"  # locale-blind comma/dot`,
    'timezone-naive': `from datetime import datetime\nnow = datetime.now() # naive, no tz info`,
    'encoding-assumption': `f, _ := os.Open("data.txt"); buf := make([]byte, 1024); f.Read(buf); // assumes UTF-8`,
    'comparison-locale': `if (name.compareTo(other) == 0) { ... } // ASCII-style comparison, breaks for accented chars`,
  };
  fs.writeFileSync(path.join(dir, 'src', `code.${ext}`), codeSamples[p.issue] || `// i18n issue: ${p.issue}\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Audit \`src/code.${ext}\` for **${p.issue}** i18n/l10n issues. List violations with line hints.\n\nEnd with: \`\`\`json\n{ "violations": [{"line": <int>, "issue_type": "${p.issue}" | "other", "fix": "<≤25 words>"}, ...] }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Audit \`src/code.${ext}\` for **${p.issue}** i18n/l10n issues via \`/codex-review\` with i18n expertise framing.\n\nEnd with: \`\`\`json\n{ "violations": [{"line": <int>, "issue_type": "${p.issue}" | "other", "fix": "<≤25 words>"}, ...], "codex_consulted": true }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T08 i18n — ${p.issue}/${p.lang}, ${p.n_violations} expected`,
    criteria: [
      { name: 'violations_min', type: 'final_json_array_min', args: { field: 'violations', min: 1 } },
      { name: 'mentions_issue_type', type: 'contains_text', args: { needle: p.issue.split('-')[0] } },
      { name: 'beta_called_codex', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T09 — concurrency / race ===========
function generateT09(dir, p) {
  const ext = { go: 'go', java: 'java', py: 'py', js: 'js', rs: 'rs' }[p.lang] || 'txt';
  const codeSamples = {
    'lost-update': `package main\nimport "sync"\nvar mu sync.Mutex\nvar counter int\nfunc inc() {\n  c := counter\n  mu.Lock()\n  counter = c + 1\n  mu.Unlock()\n}`,
    'double-checked-locking': `public class Singleton {\n  private static Singleton instance;\n  public static Singleton get() {\n    if (instance == null) {\n      synchronized (Singleton.class) {\n        if (instance == null) instance = new Singleton();\n      }\n    }\n    return instance;\n  }\n}`,
    'iterate-while-modify': `def process(items):\n    for item in items:\n        if item.expired:\n            items.remove(item)`,
    'deadlock-acquire-order': `var a, b sync.Mutex\nfunc f1() { a.Lock(); b.Lock(); /* work */ b.Unlock(); a.Unlock() }\nfunc f2() { b.Lock(); a.Lock(); /* work */ a.Unlock(); b.Unlock() }`,
    'memory-visibility': `public class Worker {\n  private boolean stopped;\n  public void stop() { stopped = true; }\n  public void run() { while (!stopped) doWork(); }\n}`,
    'promise-race': `async function fetchOrTimeout(url) {\n  return Promise.race([fetch(url), new Promise((_, r) => setTimeout(() => r('timeout'), 1000))]);\n}`,
    'tocttou': `import os\nif os.path.exists('/tmp/data'):\n    os.remove('/tmp/data')  # window between check and use`,
    'stale-read-snapshot': `func read() *Data {\n  d := globalData // copy of pointer\n  time.Sleep(100 * time.Millisecond)\n  return d // d may be stale\n}`,
    'atomic-not-atomic-compound': `private AtomicInteger counter = new AtomicInteger();\npublic void incIfEven() {\n  if (counter.get() % 2 == 0) counter.incrementAndGet();\n}`,
    'shared-mutable-state': `use std::sync::Arc;\nlet data = Arc::new(vec![1,2,3]);\nlet d = data.clone();\nstd::thread::spawn(move || { d.push(4); });`,
  };
  fs.writeFileSync(path.join(dir, 'src', `code.${ext}`), codeSamples[p.bug_type] || `// race: ${p.bug_type}\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review \`src/code.${ext}\` for concurrency/race conditions. Specifically look for **${p.bug_type}**. Subtlety level: ${p.subtlety}.\n\nEnd with: \`\`\`json\n{ "bug_class": "${p.bug_type}" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>" }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Review \`src/code.${ext}\` for concurrency bugs via \`mcp__codex__codex\` with **reasoning=high**. Look for **${p.bug_type}**.\n\nEnd with: \`\`\`json\n{ "bug_class": "${p.bug_type}" | "other", "summary": "<≤30 words>", "fix": "<≤30 words>", "codex_consulted": true, "reasoning_level": "high" }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T09 concurrency — ${p.bug_type}/${p.lang}, subtlety=${p.subtlety}`,
    criteria: [
      { name: 'bug_class_matches', type: 'final_json_field', args: { field: 'bug_class', equals: p.bug_type } },
      { name: 'summary_present', type: 'final_json_field', args: { field: 'summary' } },
      { name: 'fix_present', type: 'final_json_field', args: { field: 'fix' } },
      { name: 'mentions_concurrency_term', type: 'contains_text', args: { needle: p.bug_type.split('-')[0] } },
      { name: 'beta_used_codex', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== T10 — SQL optimization ===========
function generateT10(dir, p) {
  const querySamples = {
    'n-plus-one': `-- For each user, fetch their orders (N+1 pattern)\nSELECT * FROM users WHERE active = true;\n-- Then for each user.id:\n-- SELECT * FROM orders WHERE user_id = $1;`,
    'missing-index': `SELECT * FROM events WHERE user_id = 12345 AND created_at > NOW() - INTERVAL '7 days';\n-- Assume only user_id has index, not (user_id, created_at)`,
    'implicit-cast': `SELECT * FROM products WHERE sku = 12345; -- sku is VARCHAR but query uses integer`,
    'cross-join-cartesian': `SELECT u.*, o.* FROM users u, orders o WHERE u.created_at > '2024-01-01';`,
    'select-star-large-table': `SELECT * FROM events_archive WHERE id = 12345; -- table has 80 columns including BLOB`,
    'function-on-indexed-column': `SELECT * FROM users WHERE LOWER(email) = 'foo@example.com';`,
    'or-prevents-index': `SELECT * FROM orders WHERE customer_id = 100 OR shipping_zip = '12345';`,
    'correlated-subquery': `SELECT u.name, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count FROM users u;`,
    'in-subquery-large-set': `SELECT * FROM products WHERE id IN (SELECT product_id FROM order_items);`,
    'missing-limit': `SELECT * FROM logs WHERE level = 'ERROR' ORDER BY timestamp DESC; -- could return millions`,
  };
  fs.writeFileSync(path.join(dir, 'src', 'query.sql'), querySamples[p.antipattern] || `-- ${p.antipattern}\nSELECT * FROM t;`);
  fs.writeFileSync(path.join(dir, 'src', 'schema.sql'), `-- ${p.dialect} schema, ${p.tables} tables\nCREATE TABLE table1 (id INT PRIMARY KEY, data TEXT);\n${p.tables > 1 ? 'CREATE TABLE table2 (id INT PRIMARY KEY, t1_id INT REFERENCES table1(id));' : ''}\n${p.tables > 2 ? 'CREATE TABLE table3 (id INT PRIMARY KEY, t2_id INT REFERENCES table2(id));' : ''}`);
  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review \`src/query.sql\` against \`src/schema.sql\` (${p.dialect}). Identify the SQL anti-pattern (specifically **${p.antipattern}**) and propose an optimization.\n\nEnd with: \`\`\`json\n{ "antipattern": "${p.antipattern}" | "other", "optimization": "<≤30 words>", "improved_query_sketch": "<≤50 words>" }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Review \`src/query.sql\` against \`src/schema.sql\` (${p.dialect}). Call \`/codex-review\` to identify the **${p.antipattern}** anti-pattern.\n\nEnd with: \`\`\`json\n{ "antipattern": "${p.antipattern}" | "other", "optimization": "<≤30 words>", "improved_query_sketch": "<≤50 words>", "codex_consulted": true }\n\`\`\`\n\nProse ≤ 200 words.\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: p.id, notes: `T10 SQL opt — ${p.antipattern}/${p.dialect}, ${p.tables} tables`,
    criteria: [
      { name: 'antipattern_matches', type: 'final_json_field', args: { field: 'antipattern', equals: p.antipattern } },
      { name: 'optimization_present', type: 'final_json_field', args: { field: 'optimization' } },
      { name: 'improved_query_present', type: 'final_json_field', args: { field: 'improved_query_sketch' } },
      { name: 'mentions_keyword', type: 'contains_text', args: { needle: p.antipattern.split('-')[0] } },
      { name: 'beta_called_codex', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
}

// =========== Helper functions ===========
function camel(s) { return s.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase()); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pubMethods(module) {
  const m = { 'rate-limiter': ['consume', 'reset', 'snapshot'], 'cache-lru': ['get', 'set', 'evict'], 'retry-backoff': ['execute', 'configure', 'reset'], 'event-bus': ['emit', 'on', 'off'], 'circuit-breaker': ['call', 'tripped', 'reset'], 'feature-flag': ['isEnabled', 'override', 'snapshot'], 'session-store': ['create', 'get', 'destroy'], 'schema-validator': ['validate', 'addRule', 'errors'], 'request-router': ['route', 'addHandler', 'match'], 'config-merger': ['merge', 'override', 'snapshot'] };
  return m[module] || ['process', 'reset'];
}
function randomVerbs() { return ['create', 'read', 'update', 'delete'].slice(0, 1 + Math.floor(Math.random() * 3)).join(', '); }
function randomDeps(n, exclude) { const deps = []; for (let i = 1; i <= n; i++) if (i !== exclude && Math.random() < 0.4) deps.push(`module-${i}`); return deps.join(', ') || 'none'; }
function randomIssues(n) { const issues = ['edge case on empty input', 'race condition under load', 'cache invalidation timing', 'partial failure recovery', 'config drift across replicas']; return issues.sort(() => Math.random() - 0.5).slice(0, n); }
function subtleBugCode(domain, bug, lang, decoys) {
  const langPattern = {
    'auth-token-comparison': {
      js: `// Token validation\nconst ADMIN_TOKEN = "secret-2026";\n${decoys >= 1 ? 'const MAX_TOKEN_LEN = 64; // decoy\n' : ''}function checkAdmin(token) {\n  // BUG (${bug}): uses === which is timing-attack vulnerable\n  if (token.length > 64) return false;${decoys >= 2 ? '\n  if (!/^[a-zA-Z0-9]+$/.test(token)) return false; // decoy stricter than needed' : ''}\n  return token === ADMIN_TOKEN;\n}\nmodule.exports = { checkAdmin };\n`,
    },
    'money-rounding': {
      py: `# Money arithmetic\n${decoys >= 1 ? 'TAX_RATE = 0.085  # decoy\n' : ''}def total(items):\n    # BUG (${bug}): float accumulation has precision drift\n    s = 0.0\n    for it in items:\n        s += it.price\n${decoys >= 2 ? '    if s < 0: return 0  # decoy\n' : ''}    return round(s, 2)\n`,
    },
    'concurrent-counter': {
      go: `package counter\n\nimport "sync"\n\ntype Counter struct {\n\tmu sync.Mutex\n\tn  int\n}\n\nfunc (c *Counter) Inc() {\n\t// BUG (${bug}): read+write outside the lock can lose updates\n\tcurrent := c.n\n\tc.mu.Lock()\n\tc.n = current + 1\n\tc.mu.Unlock()\n}\n`,
    },
    'csv-parser': {
      py: `# CSV parser\ndef parse(line):\n    # BUG (${bug}): embedded \"\" inside quoted field not handled\n    if not line: return []\n    out = []\n    cur = ''\n    in_quote = False\n    for ch in line:\n        if ch == '\"':\n            in_quote = not in_quote\n        elif ch == ',' and not in_quote:\n            out.append(cur); cur = ''\n        else:\n            cur += ch\n    out.append(cur)\n    return out\n`,
    },
    'url-normalizer': {
      ts: `// URL normalizer\nexport function normalize(url: string): string {\n  // BUG (${bug}): "javascript:" scheme passes through\n  url = url.trim();\n  if (!url) return '';\n${decoys >= 1 ? '  if (url.startsWith("ftp:")) return ""; // decoy strict\n' : ''}  return url.toLowerCase();\n}\n`,
    },
    'rate-window-slide': {
      js: `// Sliding-window rate limiter\nclass RateLimiter {\n  constructor(window, max) { this.window = window; this.max = max; this.requests = []; }\n  allow(now) {\n    // BUG (${bug}): boundary inclusion off by one\n    this.requests = this.requests.filter((t) => now - t < this.window);\n    if (this.requests.length >= this.max) return false;\n    this.requests.push(now);\n    return true;\n  }\n}\nmodule.exports = { RateLimiter };\n`,
    },
    'cache-eviction-policy': {
      py: `# LRU cache\nclass LRU:\n    def __init__(self, capacity):\n        self.capacity = capacity\n        self.data = {}\n    def get(self, key):\n        if key not in self.data: return None\n        return self.data[key]\n    def set(self, key, value):\n        # BUG (${bug}): get() didn't refresh recency, so eviction is broken\n        if len(self.data) >= self.capacity:\n            oldest = next(iter(self.data))\n            del self.data[oldest]\n        self.data[key] = value\n`,
    },
    'retry-backoff': {
      go: `package retry\n\nimport "math/rand"\n\nfunc Backoff(attempt int) int {\n\t// BUG (${bug}): rand.Seed never called → deterministic across runs\n\tbase := 1 << attempt\n\treturn base + rand.Intn(100)\n}\n`,
    },
    'feature-flag-eval': {
      ts: `// Feature flag\nexport function isEnabled(flag: string, ctx: any): boolean {\n  try {\n    // BUG (${bug}): on error returns false BUT some flags need to default-on for safety\n    const result = evaluate(flag, ctx);\n    return result;\n  } catch (e) {\n    return false;\n  }\n}\nfunction evaluate(_f: string, _c: any) { throw new Error('not impl'); }\n`,
    },
    'queue-priority': {
      java: `import java.util.*;\n\npublic class PriorityQ<T> {\n    private List<T> heap = new ArrayList<>();\n    public void add(T x) { heap.add(x); siftUp(heap.size() - 1); }\n    public T removeMax() {\n        // BUG (${bug}): after removing, heap invariant not restored from index 0\n        if (heap.isEmpty()) return null;\n        T top = heap.get(0);\n        T last = heap.remove(heap.size() - 1);\n        if (!heap.isEmpty()) heap.set(0, last);\n        return top;\n    }\n    private void siftUp(int i) { /* ... */ }\n}\n`,
    },
  };
  return (langPattern[domain] && langPattern[domain][lang]) || `// ${domain}\n// BUG (${bug}): planted issue\n`;
}
function hardReasoningProblem(name, size, constraints) {
  const problems = {
    'graph-coloring': { md: `# 3-coloring of a graph\n\nGiven 5 vertices with edges: (0,1) (1,2) (2,3) (3,4) (4,0) (0,2). Assign one of {R,G,B} to each vertex so that adjacent vertices differ.\n\n## Output\n\`\`\`json\n{ "coloring": ["R","G","B","R","G"], "constraints_satisfied": true }\n\`\`\``, schema: '{ "coloring": [...], "constraints_satisfied": true }', answer_field: 'coloring' },
    'knapsack-bounded': { md: `# Knapsack\n\nItems: weights=[2,3,4,5], values=[3,4,5,6], capacity=5. Find max value.\n\n## Output\n\`\`\`json\n{ "selected_indices": [0,2], "total_value": 8 }\n\`\`\``, schema: '{ "selected_indices": [...], "total_value": <int> }', answer_field: 'selected_indices' },
    'interval-scheduling': { md: `# Interval scheduling\n\nIntervals: [(1,3),(2,5),(4,6),(5,8),(7,9)]. Find maximum non-overlapping set.\n\n## Output\n\`\`\`json\n{ "selected": [0,2,4], "count": 3 }\n\`\`\``, schema: '{ "selected": [...], "count": <int> }', answer_field: 'selected' },
    'sudoku-variant': { md: `# 4x4 mini-sudoku\n\nFill a 4x4 grid so each row, column, and 2x2 box contains 1-4.\nGiven: row 0 = [1,_,_,4], row 3 = [_,_,2,_].\n\n## Output\n\`\`\`json\n{ "grid": [[1,2,3,4],[3,4,1,2],[2,3,4,1],[4,1,2,3]], "valid": true }\n\`\`\``, schema: '{ "grid": [...], "valid": true }', answer_field: 'grid' },
    'tower-of-hanoi-variant': { md: `# Hanoi with 4 disks but only 2 pegs allowed\n\nMove 4 disks from peg A to peg C using only A and C (no spare B). Determine if solvable, and if yes, give move sequence.\n\n## Output\n\`\`\`json\n{ "solvable": true|false, "moves": [...], "reason": "..." }\n\`\`\``, schema: '{ "solvable": <bool>, "moves": [...], "reason": "..." }', answer_field: 'solvable' },
    'minimum-spanning-tree': { md: `# MST\n\nGraph edges: (a,b,1), (b,c,2), (a,c,3), (c,d,4). Find MST.\n\n## Output\n\`\`\`json\n{ "edges": [["a","b"],["b","c"],["c","d"]], "total_weight": 7 }\n\`\`\``, schema: '{ "edges": [...], "total_weight": <int> }', answer_field: 'edges' },
    'regex-equivalence': { md: `# Regex equivalence\n\nAre these equivalent?\n- A: ^a+b$\n- B: ^aa*b$\n\n## Output\n\`\`\`json\n{ "equivalent": true|false, "reasoning": "..." }\n\`\`\``, schema: '{ "equivalent": <bool>, "reasoning": "..." }', answer_field: 'equivalent' },
    'system-of-equations': { md: `# Solve\n\n2x + 3y - z = 5\nx - y + 2z = 1\n3x + y - z = 8\n\n## Output\n\`\`\`json\n{ "x": <num>, "y": <num>, "z": <num>, "verified": true }\n\`\`\``, schema: '{ "x": <num>, "y": <num>, "z": <num>, "verified": true }', answer_field: 'x' },
    'matrix-chain-mult': { md: `# Matrix chain multiplication\n\nDimensions: A(2x3), B(3x4), C(4x2). Find optimal parenthesization (min scalar multiplications).\n\n## Output\n\`\`\`json\n{ "order": "(AB)C" | "A(BC)", "min_mults": <int> }\n\`\`\``, schema: '{ "order": "...", "min_mults": <int> }', answer_field: 'order' },
    'lcs-3-strings': { md: `# Longest Common Subsequence of 3 strings\n\nFind LCS of "ABCBDAB", "BDCAB", "BACAB".\n\n## Output\n\`\`\`json\n{ "lcs": "...", "length": <int> }\n\`\`\``, schema: '{ "lcs": "...", "length": <int> }', answer_field: 'lcs' },
  };
  return problems[name] || { md: `# ${name}\n\nSolve the problem.`, schema: '{ "answer": "..." }', answer_field: 'answer' };
}
function tddTestSkeleton(module, lang) {
  const skel = {
    js: `const ${camel(module)} = require('./${module}');\nfunction assert(c, n) { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exit(1); }\n// Add tests here\nconsole.log('ALL TESTS PASSED');\n`,
    py: `from ${module.replace(/-/g, '_')} import *\ndef test_basic():\n    assert True\ntest_basic()\nprint('ALL TESTS PASSED')\n`,
    ts: `import { ${camel(module)} } from './${module}';\nfunction assert(c: boolean, n: string) { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exit(1); }\nconsole.log('ALL TESTS PASSED');\n`,
    go: `package ${module.replace(/-/g, '')}\n\nimport "testing"\nfunc TestBasic(t *testing.T) { /* todo */ }\n`,
    rs: `// tests\n#[cfg(test)] mod tests { #[test] fn basic() { assert!(true); } }\n`,
  };
  return skel[lang] || '// test skeleton\n';
}
