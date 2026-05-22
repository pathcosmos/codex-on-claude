// L6.2 fix verification — cmdGate must fail-CLOSED for Codex-shaped tools when state is corrupt.
//
// Strategy: spawn `node install/install.mjs gate --from-stdin` with various stdin payloads + HOME
// states, assert stdout contains `{"decision":"deny"}` when expected, allow otherwise.
//
// Run via:
//   node --test install/fixtures/v05/integration/cmd-gate-fail-closed.test.mjs

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const installerPath = path.join(repoRoot, 'install/install.mjs');

let tmpHome;
let configFile;

before(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'coc-gate-fc-'));
  await fs.mkdir(path.join(tmpHome, '.claude', 'codex-on-claude'), { recursive: true });
  configFile = path.join(tmpHome, '.claude', 'codex-on-claude', 'config.json');
});

after(async () => {
  if (tmpHome && (tmpHome.startsWith('/tmp/') || tmpHome.startsWith('/var/folders/'))) {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
});

function callGate(stdinPayload) {
  return spawnSync(process.execPath, [installerPath, 'gate', '--from-stdin'], {
    input: stdinPayload,
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome },
  });
}

describe('cmdGate fail-closed behavior (L6.2 fix)', () => {
  test('valid mcp__codex__codex payload + valid mode=none config → deny', async () => {
    await fs.writeFile(configFile, JSON.stringify({ choices: { usageMode: 'none' } }));
    const r = callGate(JSON.stringify({ tool_name: 'mcp__codex__codex', tool_input: { prompt: 'hi' } }));
    // B3 fix (pre-ship audit): hard-deny now exits 0 (Claude Code hook contract) — the JSON
    // decision IS the signal. stderr still carries the backstop reason for hard-deny cases.
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /"decision"\s*:\s*"deny"/);
  });

  test('valid mcp__codex__codex payload + valid mode=synergy config → allow (no output)', async () => {
    await fs.writeFile(configFile, JSON.stringify({ choices: { usageMode: 'synergy' } }));
    const r = callGate(JSON.stringify({ tool_name: 'mcp__codex__codex' }));
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /"decision"/);
  });

  test('Codex MCP payload + MISSING config → fail-CLOSED (deny)', async () => {
    await fs.unlink(configFile).catch(() => {});
    const r = callGate(JSON.stringify({ tool_name: 'mcp__codex__codex' }));
    // B3 fix (pre-ship audit): hard-deny now exits 0 (Claude Code hook contract) — the JSON
    // decision IS the signal. stderr still carries the backstop reason for hard-deny cases.
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /"decision"\s*:\s*"deny"/);
    assert.match(r.stdout, /unreadable|failing closed/i);
  });

  test('Codex MCP payload + CORRUPT config (invalid JSON) → fail-CLOSED (deny)', async () => {
    await fs.writeFile(configFile, '{"choices": {"usageMode": "non');  // truncated
    const r = callGate(JSON.stringify({ tool_name: 'mcp__codex__codex' }));
    // B3 fix (pre-ship audit): hard-deny now exits 0 (Claude Code hook contract) — the JSON
    // decision IS the signal. stderr still carries the backstop reason for hard-deny cases.
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /"decision"\s*:\s*"deny"/);
  });

  test('MALFORMED stdin (truncated JSON) but looks Codex-shaped → fail-CLOSED (deny)', async () => {
    await fs.writeFile(configFile, JSON.stringify({ choices: { usageMode: 'none' } }));
    const r = callGate('{"tool_name":"mcp__codex__codex","tool_input":{');  // truncated
    // B3 fix (pre-ship audit): hard-deny now exits 0 (Claude Code hook contract) — the JSON
    // decision IS the signal. stderr still carries the backstop reason for hard-deny cases.
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /"decision"\s*:\s*"deny"/);
    assert.match(r.stdout, /malformed/i);
  });

  test('Non-Codex tool + malformed stdin → silent allow (legacy behavior preserved)', async () => {
    const r = callGate('not a json payload at all');
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /"decision"/);
  });

  test('Empty stdin → silent return (allow)', async () => {
    const r = callGate('');
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /"decision"/);
  });

  test('Bash codex CLI bypass × mode=none → deny', async () => {
    await fs.writeFile(configFile, JSON.stringify({ choices: { usageMode: 'none' } }));
    const r = callGate(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'codex exec --json "hi"' } }));
    // B3 fix (pre-ship audit): hard-deny now exits 0 (Claude Code hook contract) — the JSON
    // decision IS the signal. stderr still carries the backstop reason for hard-deny cases.
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /"decision"\s*:\s*"deny"/);
    assert.match(r.stdout, /Codex CLI/);
  });
});
