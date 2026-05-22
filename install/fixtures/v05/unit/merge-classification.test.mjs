// Unit tests for mergeClassification(tier1Result, classification) — install/auto-probe.mjs (v0.5.0).
// Folds Tier 2 LLM probe output back into the Tier 1 decision; null classification → tier1 verbatim.
// Run: `node install/fixtures/v05/unit/merge-classification.test.mjs` — exits non-zero on failure.

import test from "node:test";
import assert from "node:assert/strict";
import { mergeClassification } from "../../../auto-probe.mjs";

const tier1 = { recipe: "alpha", confidence: 0.5, reason: "foo" };

test("chain-strict + default mode (synergy) → R6 + tier2 attached", () => {
  const r = mergeClassification(tier1, { task_type: "chain-strict", alpha_estimate: "medium" });
  assert.equal(r.recipe, "R6");
  assert.deepEqual(r.tier2, { task_type: "chain-strict", alpha_estimate: "medium" });
});

// H4 fix: chain-strict + max mode → R4 (γ hot-swap), matching applyDecisionTree behavior.
test("H4: chain-strict + mode=max → R4 (γ hot-swap, not R6)", () => {
  const r = mergeClassification(tier1, { task_type: "chain-strict", alpha_estimate: "medium" }, "max");
  assert.equal(r.recipe, "R4");
  assert.match(r.reason, /max mode|hot-swap/i);
});

test("H4: chain-strict + mode=auto → R6 (gentler escalation)", () => {
  const r = mergeClassification(tier1, { task_type: "chain-strict", alpha_estimate: "medium" }, "auto");
  assert.equal(r.recipe, "R6");
});

test("H4: chain-strict + mode=synergy → R6 (gentler escalation)", () => {
  const r = mergeClassification(tier1, { task_type: "chain-strict", alpha_estimate: "medium" }, "synergy");
  assert.equal(r.recipe, "R6");
});

test("adversarial-review → R1", () => {
  const r = mergeClassification(tier1, { task_type: "adversarial-review", alpha_estimate: "low" });
  assert.equal(r.recipe, "R1");
  assert.equal(r.confidence, 0.85);
});

test("tdd → R3", () => {
  const r = mergeClassification(tier1, { task_type: "tdd", alpha_estimate: "medium" });
  assert.equal(r.recipe, "R3");
  assert.equal(r.confidence, 0.8);
});

test("reasoning → R3", () => {
  const r = mergeClassification(tier1, { task_type: "reasoning", alpha_estimate: "low" });
  assert.equal(r.recipe, "R3");
});

test("doc-authoring → R2", () => {
  const r = mergeClassification(tier1, { task_type: "doc-authoring", alpha_estimate: "high" });
  assert.equal(r.recipe, "R2");
  assert.equal(r.confidence, 0.75);
});

test("other → preserves tier1 recipe/confidence/reason", () => {
  const r = mergeClassification(tier1, { task_type: "other", alpha_estimate: "high" });
  assert.equal(r.recipe, "alpha");
  assert.equal(r.confidence, 0.5);
  assert.equal(r.reason, "foo");
});

test("null classification (probe failed) → tier1 verbatim, no tier2 field", () => {
  const r = mergeClassification(tier1, null);
  assert.deepEqual(r, tier1);
  assert.equal(r.tier2, undefined);
});

test("non-null classification attaches tier2 nested field", () => {
  const classification = { task_type: "tdd", alpha_estimate: "medium", rationale: "tests first" };
  const r = mergeClassification(tier1, classification);
  assert.deepEqual(r.tier2, classification);
});
