// Unit tests for applyDecisionTree (signals + mode → recipe recommendation) in
// install/detect-signals.mjs. Mirrors the Quick-Ref 3-Q tree. Signals objects
// are constructed by hand here — detectSignals is NOT invoked, so this file
// only exercises the decision tree logic.
//
// Run from repo root:
//   node --test install/fixtures/v05/unit/apply-decision-tree.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyDecisionTree } from "../../../detect-signals.mjs";

// Helper: build a signals object with sane defaults; override per-test.
function sig(overrides = {}) {
  return {
    has_chain: false,
    has_strict_output: false,
    has_adversarial_defect: false,
    has_tdd: false,
    has_hard_reasoning: false,
    known_alpha_ceiling: false,
    prompt_length: 100,
    is_long_context: false,
    ...overrides,
  };
}

describe("applyDecisionTree", () => {
  test("mode='none' returns recipe='block' regardless of signals", () => {
    const d = applyDecisionTree(sig({ has_chain: true, has_strict_output: true, has_adversarial_defect: true }), "none");
    assert.equal(d.recipe, "block");
  });

  test("mode='synergy' + chain + strict → R6", () => {
    const d = applyDecisionTree(sig({ has_chain: true, has_strict_output: true }), "synergy");
    assert.equal(d.recipe, "R6");
  });

  test("mode='max' + chain + strict → R4 (γ hot-swap)", () => {
    const d = applyDecisionTree(sig({ has_chain: true, has_strict_output: true }), "max");
    assert.equal(d.recipe, "R4");
  });

  test("mode='synergy' + adversarial only → R1", () => {
    const d = applyDecisionTree(sig({ has_adversarial_defect: true }), "synergy");
    assert.equal(d.recipe, "R1");
  });

  test("mode='synergy' + hard reasoning → R3", () => {
    const d = applyDecisionTree(sig({ has_hard_reasoning: true }), "synergy");
    assert.equal(d.recipe, "R3");
  });

  test("mode='synergy' + TDD → R3", () => {
    const d = applyDecisionTree(sig({ has_tdd: true }), "synergy");
    assert.equal(d.recipe, "R3");
  });

  test("mode='synergy' + known_alpha_ceiling + non-adversarial → alpha", () => {
    const d = applyDecisionTree(sig({ known_alpha_ceiling: true }), "synergy");
    assert.equal(d.recipe, "alpha");
  });

  test("mode='synergy' + known_alpha_ceiling + adversarial → R1 (overrides ceiling)", () => {
    const d = applyDecisionTree(sig({ known_alpha_ceiling: true, has_adversarial_defect: true }), "synergy");
    assert.equal(d.recipe, "R1");
  });

  test("mode='max' + no β-favorable signals → R5", () => {
    const d = applyDecisionTree(sig(), "max");
    assert.equal(d.recipe, "R5");
  });

  test("mode='auto' + no β-favorable signals → alpha with confidence < 0.7 (Tier 2 range)", () => {
    const d = applyDecisionTree(sig(), "auto");
    assert.equal(d.recipe, "alpha");
    assert.equal(d.confidence < 0.7, true);
  });
});
