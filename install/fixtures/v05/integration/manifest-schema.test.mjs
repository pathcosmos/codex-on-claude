// v0.5.0 integration test: manifest schema sanity.
//
// Verifies the shape of install/manifest.json — specifically the v0.5.0
// additions (usageMode, autoTier2LLMProbe, guardrails) and a v0.4.1 regression
// check on modelMatrix. Pure JSON-only test, no filesystem mutation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.resolve(__dirname, "../../../manifest.json");

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

test("manifest.version is 0.5.4 (v0.5.4 MEDIUM #2 render fix)", () => {
  assert.equal(manifest.version, "0.5.4");
});

test("questions.usageMode has 4 choices with the exact expected keys", () => {
  const q = manifest.questions?.usageMode;
  assert.ok(q, "questions.usageMode must exist");
  assert.equal(q.choices.length, 4, "usageMode must have 4 choices");
  const keys = q.choices.map((c) => c.key);
  assert.deepEqual(keys, ["none", "synergy", "auto", "max"]);
});

test("questions.autoTier2LLMProbe has 2 choices with keys [on, off]", () => {
  const q = manifest.questions?.autoTier2LLMProbe;
  assert.ok(q, "questions.autoTier2LLMProbe must exist");
  assert.equal(q.choices.length, 2, "autoTier2LLMProbe must have 2 choices");
  const keys = q.choices.map((c) => c.key);
  assert.deepEqual(keys, ["on", "off"]);
});

test("questions.guardrails.defaults has all 4 expected keys", () => {
  const defaults = manifest.questions?.guardrails?.defaults;
  assert.ok(defaults, "questions.guardrails.defaults must exist");
  const expected = ["chainJsonTrap", "subagentStrict", "turnBurn", "ceilingNoUpside"];
  for (const k of expected) {
    assert.ok(k in defaults, `guardrails.defaults missing key: ${k}`);
    assert.equal(typeof defaults[k], "string", `guardrails.defaults.${k} must be a string`);
    assert.ok(defaults[k].length > 0, `guardrails.defaults.${k} must be non-empty`);
  }
});

test("every choice in every question has a non-empty label string", () => {
  const failures = [];
  for (const [qKey, qVal] of Object.entries(manifest.questions || {})) {
    if (!Array.isArray(qVal?.choices)) continue; // skip info-type questions
    for (const choice of qVal.choices) {
      if (typeof choice.label !== "string" || choice.label.length === 0) {
        failures.push(`${qKey}.${choice.key}`);
      }
    }
  }
  assert.deepEqual(failures, [], `choices with empty/missing label: ${failures.join(", ")}`);
});

test("modelMatrix is intact (no v0.4.1 regression)", () => {
  const mm = manifest.modelMatrix;
  assert.ok(mm, "modelMatrix must exist");
  assert.ok(mm.claude, "modelMatrix.claude must exist");
  assert.ok(mm.codex, "modelMatrix.codex must exist");
  // sanity: at least the recommended tiers must be present
  for (const tier of ["free", "pro", "max"]) {
    assert.ok(mm.claude[tier], `modelMatrix.claude.${tier} missing`);
    assert.ok(Array.isArray(mm.claude[tier].models), `modelMatrix.claude.${tier}.models must be array`);
    assert.ok(Array.isArray(mm.claude[tier].reasoning), `modelMatrix.claude.${tier}.reasoning must be array`);
    assert.ok(mm.claude[tier].base?.id, `modelMatrix.claude.${tier}.base.id missing`);
  }
  for (const tier of ["free", "plus", "pro"]) {
    assert.ok(mm.codex[tier], `modelMatrix.codex.${tier} missing`);
    assert.ok(Array.isArray(mm.codex[tier].models));
    assert.ok(Array.isArray(mm.codex[tier].reasoning));
    assert.ok(mm.codex[tier].base?.id);
  }
});
