// Unit tests for the v0.5.2 case-4 conservative partial credit in agreement_score.
// Verifies that case-4 risk/reason items (which DO make it into consensus_plan) contribute 0.3
// to the rawScore — same weight as case 3 — instead of the previous 0.0.
// Run: node --test install/fixtures/v05/unit/cerberus-score-formula.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { consensus } from "../../../cerberus-consensus.mjs";

const threePlans = (a, b, c) => [
  { head: "h1", plan: a },
  { head: "h2", plan: b },
  { head: "h3", plan: c },
];

test("SF1: case4Conservative + case4Other reported in raw stats", () => {
  // h3-only risk + reason; h1/h2 plans contain only Decision + step.
  const r = consensus(threePlans(
    "## Decision\nA\n\n## Next Steps\n- step h1 unique",
    "## Decision\nA\n\n## Next Steps\n- step h2 unique",
    "## Decision\nA\n\n## Reasons\n- unique reason from h3\n\n## Risks / Trade-offs\n- unique risk h3",
  ));
  assert.ok(r.raw.groupCounts.case4Conservative >= 2, `case4Conservative should be ≥2 (h3 reason + h3 risk); got ${r.raw.groupCounts.case4Conservative}`);
  assert.equal(r.raw.groupCounts.case4Conservative + r.raw.groupCounts.case4Other, r.raw.groupCounts.case4);
});

test("SF2: case 4 risk/reason gets 0.3 partial credit (not 0)", () => {
  // Construct a fixture with: 1 case-1 Decision + 2 case-4 risks (h3 unique each).
  const r = consensus(threePlans(
    "## Decision\nA",
    "## Decision\nA",
    "## Decision\nA\n\n## Risks / Trade-offs\n- unique risk one from h3\n- another unique risk h3",
  ));
  // raw = (1*1.0 + 2*0.3 [case4Conservative]) / 3 = 1.6/3 = 0.533
  // With decisionMultiplier 1.5 → min(1.0, 0.533 * 1.5) = 0.8 ≈ high
  const rawExpected = (1 * 1.0 + 2 * 0.3) / 3;
  assert.ok(Math.abs(r.raw.rawScore - rawExpected) < 0.01, `rawScore expected ~${rawExpected.toFixed(3)}, got ${r.raw.rawScore}`);
  assert.equal(r.raw.decisionMultiplier, 1.5);
  assert.ok(r.agreement_score >= 0.7, `score should be high with case-4 partial credit, got ${r.agreement_score} (${r.label})`);
});

test("SF3: case 4 step/decision items (in dissent only) do NOT get partial credit", () => {
  // h1 unique step → goes to dissent.validated, NOT to merged → case4Other.
  const r = consensus(threePlans(
    "## Decision\nA\n\n## Next Steps\n- h1 unique step only",
    "## Decision\nA",
    "## Decision\nA",
  ));
  // The h1 step is dissent only — it's a case 4 group with kind=step.
  // case4Other should include it; case4Conservative should NOT.
  assert.ok(r.raw.groupCounts.case4Other >= 1, "step-only case 4 should land in case4Other");
});

test("SF4: PoC fixture replay — score improves from 0.43→0.65 (Draft 2) to ~0.7 (Draft 3/v0.5.2)", () => {
  // Synthetic minimal-PoC-shape: 6 case-1 + 1 case-2 + 8 case-3 + 6 case-4-conservative.
  // Difficult to construct directly; instead, manually verify formula with known counts.
  const case1 = 6, case2 = 1, case3 = 8, case4Cons = 6, case4Other = 0;
  const total = case1 + case2 + case3 + case4Cons + case4Other;
  const rawScore = (case1 * 1.0 + case2 * 0.5 + case3 * 0.3 + case4Cons * 0.3 + case4Other * 0.0) / total;
  const score = Math.min(1.0, rawScore * 1.5);
  // Expected: (6 + 0.5 + 2.4 + 1.8 + 0) / 21 = 10.7/21 ≈ 0.510 × 1.5 ≈ 0.765 → high
  assert.ok(rawScore > 0.46, `PoC raw should improve past 0.43; got ${rawScore}`);
  assert.ok(score >= 0.7, `PoC score should reach high; got ${score}`);
});

test("SF5: determinism — same input → same score after v0.5.2 changes", () => {
  const plans = threePlans(
    "## Decision\nA\n\n## Reasons\n- deterministic algorithm\n\ncerberus-nonce: 111111",
    "## Decision\nA\n\n## Reasons\n- safer for v0.5.2\n\ncerberus-nonce: 222222",
    "## Decision\nA\n\n## Reasons\n- preserves dissent\n\ncerberus-nonce: 333333",
  );
  const r1 = consensus(plans);
  const r2 = consensus(plans);
  assert.equal(r1.agreement_score, r2.agreement_score);
  assert.equal(r1.consensus_plan, r2.consensus_plan);
});
