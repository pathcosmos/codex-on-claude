import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);

// AV: 7 non-T12 adversarial templates (different bug domains)
const ADV_SCENARIOS = [
  { id: 'AV01', domain: 'auth-jwt-validation', subtle_bug: 'iss_claim_skipped', lang: 'js' },
  { id: 'AV02', domain: 'serialization-prototype', subtle_bug: 'prototype_pollution', lang: 'js' },
  { id: 'AV03', domain: 'integer-overflow', subtle_bug: 'unchecked_arithmetic', lang: 'go' },
  { id: 'AV04', domain: 'sql-injection-stored-proc', subtle_bug: 'dynamic_sql_in_proc', lang: 'sql' },
  { id: 'AV05', domain: 'xxe-xml-parse', subtle_bug: 'external_entity_unblocked', lang: 'py' },
  { id: 'AV06', domain: 'ssrf-url-fetch', subtle_bug: 'localhost_not_blocked', lang: 'js' },
  { id: 'AV07', domain: 'race-double-spend', subtle_bug: 'no_atomic_decrement', lang: 'go' },
];

const ADV_CODE = {
  'auth-jwt-validation': `// jwt validator
const jwt = require('jsonwebtoken');
function verifyToken(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  // BUG: iss/aud/exp claims not validated
}`,
  'serialization-prototype': `function deepMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object') {
      target[key] = target[key] || {};
      deepMerge(target[key], source[key]);
    } else { target[key] = source[key]; }
  }
  return target; // BUG: __proto__/constructor pollution
}`,
  'integer-overflow': `package main
func calcDiscount(orderTotal, discountPercent int32) int32 {
  return orderTotal * discountPercent / 100  // BUG: orderTotal * discountPercent may overflow int32
}`,
  'sql-injection-stored-proc': `CREATE PROCEDURE GetUser(IN username VARCHAR(50)) BEGIN
  SET @query = CONCAT('SELECT * FROM users WHERE name = ''', username, '''');
  PREPARE stmt FROM @query;  -- BUG: dynamic SQL with user input
  EXECUTE stmt;
END;`,
  'xxe-xml-parse': `import xml.etree.ElementTree as ET
def parse_xml(xml_string):
    tree = ET.fromstring(xml_string)  # BUG: external entities not blocked
    return tree`,
  'ssrf-url-fetch': `async function proxyFetch(url) {
  // BUG: no allowlist - allows http://localhost:6379 etc
  const res = await fetch(url);
  return await res.text();
}`,
  'race-double-spend': `func withdraw(account *Account, amount int) bool {
  if account.balance >= amount {  // BUG: TOCTTOU - balance read, then write
    time.Sleep(1 * time.Millisecond)
    account.balance -= amount
    return true
  }
  return false
}`,
};

for (const s of ADV_SCENARIOS) {
  const dir = path.join(here, s.id);
  if (fs.existsSync(dir)) { console.log(`SKIP ${s.id}`); continue; }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  const ext = { js: 'js', py: 'py', go: 'go', sql: 'sql' }[s.lang];
  fs.writeFileSync(path.join(dir, 'src', `code.${ext}`), ADV_CODE[s.domain] || `// ${s.domain}\n`);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    id: s.id, template: 'AV', category: 'Adversarial review (non-T12)',
    hypothesis_target: 'P2_generalizability',
    params: s,
    test: 'does adversarial framing generalize beyond T12 template?',
  }, null, 2));

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review src/code.${ext}. Identify the critical bug (specifically ${s.subtle_bug}-related).\n\nEnd with: { "critical_issue": "<≤30 words>", "category": "${s.subtle_bug}" | "other", "line_hint": <int> }\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Adversarial review of src/code.${ext} via /codex-review. Framing: "find subtle bugs from semantics, not surface". Look for ${s.subtle_bug}.\n\nEnd with: { "critical_issue": "<≤30 words>", "category": "${s.subtle_bug}" | "other", "line_hint": <int>, "codex_consulted": true }\n`);
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({
    scenario: s.id, notes: `AV non-T12 adversarial — ${s.domain}, bug=${s.subtle_bug}`,
    criteria: [
      { name: 'category_matches', type: 'final_json_field', args: { field: 'category', equals: s.subtle_bug } },
      { name: 'critical_issue_present', type: 'final_json_field', args: { field: 'critical_issue' } },
      { name: 'line_hint_present', type: 'final_json_field', args: { field: 'line_hint' } },
      { name: 'mentions_bug_keyword', type: 'contains_text', args: { needle: s.subtle_bug.split('_')[0] } },
      { name: 'beta_codex_called', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
    ],
  }, null, 2));
  console.log(`✓ ${s.id} (${s.domain})`);
}

// RS: 5 R-series codebases with STRICT ORACLE (require specific issue categories)
const STRICT_R = [
  { id: 'RS01', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/hooks.mjs', focus: 'mixed-ownership stripping correctness', required_issues: ['mixed_ownership', 'json_corruption', 'idempotence'] },
  { id: 'RS02', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/analyze.mjs', focus: '9-rule analyzer edge cases', required_issues: ['threshold_off_by_one', 'concurrent_log_reads', 'time_window'] },
  { id: 'RS03', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/threads.mjs', focus: 'thread catalog state machine', required_issues: ['fallback_state_orphan', 'turn_count_race', 'incident_growth'] },
  { id: 'RS04', src: '/Volumes/minim42tbtmm/pathcosmos/codex-on-claude/install/templater.mjs', focus: 'template substitution safety', required_issues: ['undefined_var', 'escaping', 'circular'] },
  { id: 'RS05', src: '/Users/lanco/aidata/pathcosmos/cli-ascii-usage/src/cli.ts', focus: 'CLI arg parsing edge cases', required_issues: ['unicode_handling', 'empty_input', 'flag_collision'] },
];

for (const r of STRICT_R) {
  const dir = path.join(here, r.id);
  if (fs.existsSync(dir)) { console.log(`SKIP ${r.id}`); continue; }
  if (!fs.existsSync(r.src)) { console.log(`SKIP ${r.id} - src missing`); continue; }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  const ext = path.extname(r.src);
  fs.writeFileSync(path.join(dir, 'src', `module${ext}`), fs.readFileSync(r.src));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    id: r.id, template: 'RS', category: 'Real codebase review (strict ORACLE)',
    hypothesis_target: 'P2_real_strict',
    source: { path: r.src.replace(/^\/Users\/lanco/, '~'), focus: r.focus },
    required_issues: r.required_issues,
    test: 'does strict ORACLE produce partial-fail (sweet spot entry)?',
  }, null, 2));

  fs.writeFileSync(path.join(dir, 'PROMPT.alpha.md'),
    `Review src/module${ext} for specific issue categories: ${r.required_issues.join(', ')}. Each category MUST be addressed with at least one finding.\n\nEnd with: { "findings_by_category": { ${r.required_issues.map(c => `"${c}": "<≤25 words finding>"`).join(', ')} } }\n`);
  fs.writeFileSync(path.join(dir, 'PROMPT.beta.md'),
    `Review src/module${ext} via /codex-review. Focus categories: ${r.required_issues.join(', ')}. Each MUST have a specific finding.\n\nEnd with: { "findings_by_category": { ${r.required_issues.map(c => `"${c}": "<≤25 words finding>"`).join(', ')} }, "codex_consulted": true }\n`);
  // STRICT ORACLE: each required category must be present in JSON
  const criteria = [
    { name: 'findings_by_category_present', type: 'final_json_field', args: { field: 'findings_by_category' } },
    { name: 'mentions_focus_term', type: 'contains_text', args: { needle: r.focus.split(' ')[0] } },
    ...r.required_issues.map((c) => ({ name: `mentions_${c}`, type: 'contains_text', args: { needle: c.split('_')[0] } })),
    { name: 'beta_codex_called', type: 'arm_specific', args: { arm: 'beta', inner_type: 'tool_call_count_min', inner_args: { name: 'mcp__codex__codex', min: 1 } } },
  ];
  fs.writeFileSync(path.join(dir, 'ORACLE.json'), JSON.stringify({ scenario: r.id, notes: `RS strict ORACLE — ${path.basename(r.src)}, ${r.required_issues.length} required categories`, criteria }, null, 2));
  console.log(`✓ ${r.id} (${path.basename(r.src)})`);
}
