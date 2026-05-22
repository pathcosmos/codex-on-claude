// L6.1/L6.2 fix-set — extended decideGate cases for wildcard MCP matcher + Bash CLI gate.
//
// Run via:
//   node --test install/fixtures/v05/unit/decide-gate-extended.test.mjs

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decideGate, GATE_MARKER } from '../../../hooks.mjs';

const cfgNone = { choices: { usageMode: 'none' } };
const cfgSyn = { choices: { usageMode: 'synergy' } };

describe('decideGate — wildcard MCP matcher (L6.1 fix)', () => {
  test('mcp__codex__codex × none → deny', () => {
    const r = decideGate({ tool_name: 'mcp__codex__codex' }, cfgNone);
    assert.equal(r.decision, 'deny');
    assert.equal(r.meta.source, 'mcp');
  });
  test('mcp__codex__codex-reply × none → deny', () => {
    const r = decideGate({ tool_name: 'mcp__codex__codex-reply' }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('mcp__codex__codex_resume (hypothetical future variant) × none → deny', () => {
    const r = decideGate({ tool_name: 'mcp__codex__codex_resume' }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('mcp__codex__anything × none → deny (prefix widened)', () => {
    const r = decideGate({ tool_name: 'mcp__codex__totally_new_thing' }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('Case-insensitive: MCP__CODEX__CODEX × none → deny (no case bypass)', () => {
    const r = decideGate({ tool_name: 'MCP__CODEX__CODEX' }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('non-codex MCP tool × none → allow (gate scope)', () => {
    const r = decideGate({ tool_name: 'mcp__other__do_thing' }, cfgNone);
    assert.equal(r.decision, 'allow');
  });
});

describe('decideGate — Bash CLI gate (L6.2 fix)', () => {
  test('Bash + "codex exec ..." × none → deny (CLI bypass)', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'codex exec --json "hi"' } }, cfgNone);
    assert.equal(r.decision, 'deny');
    assert.equal(r.meta.source, 'bash-cli');
    assert.ok(r.reason.includes('Codex CLI'));
  });
  test('Bash + "codex-on-claude threads resume <id>" × none → deny', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'codex-on-claude threads resume 019e-xxxx "follow-up"' } }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('Bash + "npx @openai/codex doctor" × none → deny', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'npx @openai/codex doctor' } }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('Bash + benign "ls codex-on-claude/" × none → allow (not invoking codex)', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'ls codex-on-claude/' } }, cfgNone);
    assert.equal(r.decision, 'allow');
  });
  test('Bash + "codexcli" (random identifier containing codex) × none → allow', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'echo "var codexcli = 1"' } }, cfgNone);
    assert.equal(r.decision, 'allow');
  });
  test('Bash + codex CLI × synergy → allow', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'codex exec "test"' } }, cfgSyn);
    assert.equal(r.decision, 'allow');
  });
  test('Bash + piped codex command × none → deny', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: 'echo prompt | codex exec --json' } }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
  test('Bash + path-qualified /usr/local/bin/codex × none → deny', () => {
    const r = decideGate({ tool_name: 'Bash', tool_input: { command: '/usr/local/bin/codex exec --json' } }, cfgNone);
    assert.equal(r.decision, 'deny');
  });
});

describe('decideGate — deny reason contains marker meta', () => {
  test('mode=none deny carries GATE_MARKER in meta', () => {
    const r = decideGate({ tool_name: 'mcp__codex__codex' }, cfgNone);
    assert.equal(r.meta.marker, GATE_MARKER);
  });
});
