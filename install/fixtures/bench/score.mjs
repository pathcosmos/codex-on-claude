#!/usr/bin/env node
// score.mjs — Read ORACLE.json + run artifacts, write result.json with rubric pass/fail.
//
// Usage: node score.mjs <scenario-dir-name> <out-dir>
//   <scenario-dir-name>: e.g. "B3-bugfix" (resolved under install/fixtures/bench/)
//   <out-dir>: e.g. "_runs/.../B3-bugfix/alpha" (where stream.jsonl etc. live)
//
// Output schema (result.json):
//   {
//     scenario: "B3-bugfix",
//     arm: "alpha"|"beta",
//     criteria: { <name>: {pass: bool, detail: string} },
//     score: { passed: N, total: M },
//     final_text: "<last assistant message>",
//     final_json: { ... }   // last fenced ```json``` block parsed, if any
//   }

import fs from 'node:fs';
import path from 'node:path';

const [, , scenName, outDir] = process.argv;
if (!scenName || !outDir) {
  console.error('usage: score.mjs <scenario> <out-dir>');
  process.exit(2);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const fxDir = path.join(here, scenName);
const oraclePath = path.join(fxDir, 'ORACLE.json');
const oracle = fs.existsSync(oraclePath)
  ? JSON.parse(fs.readFileSync(oraclePath, 'utf8'))
  : { criteria: [] };

const arm = path.basename(outDir);

// ---- read artifacts ----
const streamPath = path.join(outDir, 'stream.jsonl');
const stream = fs.existsSync(streamPath)
  ? fs.readFileSync(streamPath, 'utf8').split('\n').filter(Boolean).map(safeParse).filter(Boolean)
  : [];

const toolCallsPath = path.join(outDir, 'tool_calls.jsonl');
const toolCalls = fs.existsSync(toolCallsPath)
  ? fs.readFileSync(toolCallsPath, 'utf8').split('\n').filter(Boolean).map(safeParse).filter(Boolean)
  : [];

const finalText = extractFinalAssistantText(stream);
const finalJson = extractTrailingJson(finalText);

const changedFilesPath = path.join(outDir, 'changed.files.txt');
const changedFiles = fs.existsSync(changedFilesPath)
  ? parseChangedFiles(fs.readFileSync(changedFilesPath, 'utf8'))
  : [];

const testsExitPath = path.join(outDir, 'tests.exit');
const testsExit = fs.existsSync(testsExitPath)
  ? parseInt(fs.readFileSync(testsExitPath, 'utf8').trim(), 10)
  : null;

// ---- evaluate each criterion ----
const criteria = {};
for (const c of oracle.criteria || []) {
  criteria[c.name] = evaluate(c, { finalText, finalJson, toolCalls, changedFiles, testsExit, arm, oracle });
}

const passed = Object.values(criteria).filter((r) => r.pass).length;
const total = Object.keys(criteria).length;

const result = {
  scenario: scenName,
  arm,
  criteria,
  score: { passed, total },
  final_text: finalText.slice(-2000),
  final_json: finalJson,
};
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(`[score] ${scenName}/${arm}: ${passed}/${total} criteria passed`);

// ---- helpers ----
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function extractFinalAssistantText(events) {
  let last = '';
  for (const e of events) {
    if (e.type === 'assistant' && Array.isArray(e?.message?.content)) {
      const t = e.message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n');
      if (t) last = t;
    }
  }
  return last;
}

function extractTrailingJson(text) {
  if (!text) return null;
  // Find the LAST ```json ... ``` fenced block
  const re = /```json\s*([\s\S]*?)```/g;
  let match, lastBlock = null;
  while ((match = re.exec(text)) !== null) { lastBlock = match[1]; }
  if (!lastBlock) return null;
  try { return JSON.parse(lastBlock); } catch { return { __parse_error: true, raw: lastBlock.slice(0, 500) }; }
}

function parseChangedFiles(stat) {
  // git diff --stat output lines like "  src/foo.js | 3 +-"
  return stat.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('|'))
    .map((l) => l.split('|')[0].trim());
}

function evaluate(criterion, ctx) {
  const { type, args = {} } = criterion;
  try {
    switch (type) {
      case 'contains_text': {
        const needle = args.needle;
        const ok = ctx.finalText.toLowerCase().includes(String(needle).toLowerCase());
        return { pass: ok, detail: ok ? `found '${needle}'` : `'${needle}' not in final text` };
      }
      case 'not_contains_text': {
        const needle = args.needle;
        const ok = !ctx.finalText.toLowerCase().includes(String(needle).toLowerCase());
        return { pass: ok, detail: ok ? `'${needle}' not present` : `unexpected '${needle}' in final text` };
      }
      case 'word_count_max': {
        const max = args.max;
        const words = (ctx.finalText.match(/\S+/g) || []).length;
        return { pass: words <= max, detail: `${words} words (max ${max})` };
      }
      case 'final_json_field': {
        const { field, equals, in: inList } = args;
        const v = (ctx.finalJson || {})[field];
        let ok = false;
        if (equals !== undefined) ok = v === equals;
        else if (Array.isArray(inList)) ok = inList.includes(v);
        else ok = v !== undefined;
        return { pass: ok, detail: `${field} = ${JSON.stringify(v)}` };
      }
      case 'final_json_array_min': {
        const { field, min } = args;
        const v = (ctx.finalJson || {})[field];
        const len = Array.isArray(v) ? v.length : 0;
        return { pass: len >= min, detail: `len(${field}) = ${len} (min ${min})` };
      }
      case 'final_json_array_max': {
        const { field, max } = args;
        const v = (ctx.finalJson || {})[field];
        const len = Array.isArray(v) ? v.length : 0;
        return { pass: len <= max, detail: `len(${field}) = ${len} (max ${max})` };
      }
      case 'tests_pass': {
        const ok = ctx.testsExit === 0;
        return { pass: ok, detail: `tests exit = ${ctx.testsExit}` };
      }
      case 'changed_files_subset_of': {
        const allow = new Set(args.allowlist || []);
        const bad = ctx.changedFiles.filter((f) => !allow.has(f));
        return { pass: bad.length === 0, detail: bad.length ? `outside allowlist: ${bad.join(', ')}` : 'all changes within allowlist' };
      }
      case 'changed_files_min': {
        return { pass: ctx.changedFiles.length >= args.min, detail: `${ctx.changedFiles.length} files changed (min ${args.min})` };
      }
      case 'changed_files_max': {
        return { pass: ctx.changedFiles.length <= args.max, detail: `${ctx.changedFiles.length} files changed (max ${args.max})` };
      }
      case 'tool_call_count_max': {
        const { name, max } = args;
        const n = ctx.toolCalls.filter((c) => c.name === name).length;
        return { pass: n <= max, detail: `${n} ${name} calls (max ${max})` };
      }
      case 'tool_call_count_min': {
        const { name, min } = args;
        const n = ctx.toolCalls.filter((c) => c.name === name).length;
        return { pass: n >= min, detail: `${n} ${name} calls (min ${min})` };
      }
      case 'arm_specific': {
        // Only enforce on a specific arm; trivially pass on the other.
        if (ctx.arm !== args.arm) return { pass: true, detail: `n/a on ${ctx.arm}` };
        // Delegate to inner type.
        return evaluate({ type: args.inner_type, args: args.inner_args || {} }, ctx);
      }
      default:
        return { pass: false, detail: `unknown criterion type: ${type}` };
    }
  } catch (e) {
    return { pass: false, detail: `evaluator error: ${e.message}` };
  }
}
