// Unit tests for decideGate(payload, config) — install/hooks.mjs (v0.5.0).
// Pure-function gate: codex MCP calls deny when usageMode=none; everything else allows.
// Run: `node install/fixtures/v05/unit/decide-gate.test.mjs` — exits non-zero on failure.

import test from "node:test";
import assert from "node:assert/strict";
import { decideGate, GATE_MARKER } from "../../../hooks.mjs";

test("codex tool + usageMode=none → deny with reconfigure hint", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, { choices: { usageMode: "none" } });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /reconfigure/i);
});

test("codex-reply tool + usageMode=none → deny", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex-reply" }, { choices: { usageMode: "none" } });
  assert.equal(r.decision, "deny");
});

test("codex tool + usageMode=synergy → allow", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, { choices: { usageMode: "synergy" } });
  assert.equal(r.decision, "allow");
  assert.equal(r.meta.mode, "synergy");
});

test("codex tool + usageMode=auto → allow", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, { choices: { usageMode: "auto" } });
  assert.equal(r.decision, "allow");
  assert.equal(r.meta.mode, "auto");
});

test("codex tool + usageMode=max → allow", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, { choices: { usageMode: "max" } });
  assert.equal(r.decision, "allow");
  assert.equal(r.meta.mode, "max");
});

test("non-codex tool (Read) + usageMode=none → allow (gate is scoped)", () => {
  const r = decideGate({ tool_name: "Read" }, { choices: { usageMode: "none" } });
  assert.equal(r.decision, "allow");
  assert.match(r.reason, /non-codex/i);
});

test("missing tool_name + usageMode=none → allow (fail-open on malformed payload)", () => {
  const r = decideGate({}, { choices: { usageMode: "none" } });
  assert.equal(r.decision, "allow");
});

test("null config (no install) → allow, mode defaults to synergy", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, null);
  assert.equal(r.decision, "allow");
  assert.equal(r.meta.mode, "synergy");
});

test("deny case: meta.mode and meta.marker populated", () => {
  const r = decideGate({ tool_name: "mcp__codex__codex" }, { choices: { usageMode: "none" } });
  assert.equal(r.meta.mode, "none");
  assert.equal(r.meta.marker, GATE_MARKER);
});

test("camelCase toolName field is detected as alternate", () => {
  const r = decideGate({ toolName: "mcp__codex__codex" }, { choices: { usageMode: "none" } });
  assert.equal(r.decision, "deny");
});
