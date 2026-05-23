// Unit tests for v0.5.5 LOW finding fix — install/cerberus-config.mjs.
// Pre-v0.5.5: choices.cerberusConfig was not seeded, AND cerberus-server.mjs:loadConfig() read
// `cfg.choices.cerberus` ("on"/"off" enum) treating it as an object → user overrides never
// flowed through. Tests assert both halves of the fix.
//
// Run: node --test install/fixtures/v05/unit/cerberus-config.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { seedCerberusConfig, consensusOptsFromConfig, costCapFromConfig } from "../../../cerberus-config.mjs";

// ── seedCerberusConfig ─────────────────────────────────────────────────────

test("I7a: seedCerberusConfig adds {} when cerberus=on and field absent", () => {
  const choices = { cerberus: "on", patterns: ["review"] };
  seedCerberusConfig(choices);
  assert.deepEqual(choices.cerberusConfig, {});
});

test("I7b: seedCerberusConfig preserves prior cerberusConfig (no overwrite)", () => {
  const prior = { headWeights: { h1: 2.0, h2: 1.0, h3: 1.0 }, jaccardGroupThreshold: 0.55 };
  const choices = { cerberus: "on", cerberusConfig: prior };
  seedCerberusConfig(choices);
  assert.equal(choices.cerberusConfig, prior, "must keep the same reference (no clone, no overwrite)");
  assert.deepEqual(choices.cerberusConfig, prior);
});

test("I7c: seedCerberusConfig is a no-op when cerberus=off", () => {
  const choices = { cerberus: "off", patterns: ["review"] };
  seedCerberusConfig(choices);
  assert.equal("cerberusConfig" in choices, false);
});

test("I7d: seedCerberusConfig tolerates null/undefined choices", () => {
  assert.equal(seedCerberusConfig(null), null);
  assert.equal(seedCerberusConfig(undefined), undefined);
});

// ── consensusOptsFromConfig ────────────────────────────────────────────────

test("I8a: consensusOptsFromConfig returns {} when cerberusConfig absent", () => {
  assert.deepEqual(consensusOptsFromConfig({}), {});
  assert.deepEqual(consensusOptsFromConfig({ choices: {} }), {});
  assert.deepEqual(consensusOptsFromConfig({ choices: { cerberusConfig: {} } }), {});
});

test("I8b: consensusOptsFromConfig forwards only defined numeric fields", () => {
  const cfg = { choices: { cerberusConfig: { jaccardGroupThreshold: 0.55, decisionMultiplier: 1.7 } } };
  const opts = consensusOptsFromConfig(cfg);
  assert.deepEqual(opts, { jaccardGroupThreshold: 0.55, decisionMultiplier: 1.7 });
});

test("I8c: consensusOptsFromConfig drops non-numeric numeric fields silently", () => {
  // Bad config — string instead of number — must NOT propagate.
  const cfg = { choices: { cerberusConfig: { jaccardGroupThreshold: "0.55" } } };
  assert.deepEqual(consensusOptsFromConfig(cfg), {});
});

test("I8d: consensusOptsFromConfig forwards headWeights object as-is", () => {
  const cfg = { choices: { cerberusConfig: { headWeights: { h1: 2.0, h2: 0.5, h3: 1.5 } } } };
  assert.deepEqual(consensusOptsFromConfig(cfg), { headWeights: { h1: 2.0, h2: 0.5, h3: 1.5 } });
});

test("I8e: consensusOptsFromConfig forwards v0.5.5+ decisionPartialMultiplier", () => {
  const cfg = { choices: { cerberusConfig: { decisionPartialMultiplier: 1.2 } } };
  assert.deepEqual(consensusOptsFromConfig(cfg), { decisionPartialMultiplier: 1.2 });
});

// ── costCapFromConfig ───────────────────────────────────────────────────────

test("I8f: costCapFromConfig defaults to 50000", () => {
  assert.equal(costCapFromConfig({}), 50000);
  assert.equal(costCapFromConfig({ choices: {} }), 50000);
});

test("I8g: costCapFromConfig accepts explicit override", () => {
  assert.equal(costCapFromConfig({ choices: { cerberusConfig: { costCapTokens: 12345 } } }), 12345);
});

test("I8h: costCapFromConfig rejects non-numeric / negative", () => {
  assert.equal(costCapFromConfig({ choices: { cerberusConfig: { costCapTokens: -1 } } }), 50000);
  assert.equal(costCapFromConfig({ choices: { cerberusConfig: { costCapTokens: "100k" } } }), 50000);
});
