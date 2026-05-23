// Unit tests for the Cerberus consensus algorithm (A) — install/cerberus-consensus.mjs (v0.5.1).
// Covers: determinism, agreement_score formula (decision multiplier), dissent buckets,
// missing-head handling (case 3), single-head risk/reason inclusion (case 4 conservative).
// Run: `node --test install/fixtures/v05/unit/cerberus-consensus.test.mjs`

import test from "node:test";
import assert from "node:assert/strict";
import { consensus, extractTopics, jaccard, normalizeTokens } from "../../../cerberus-consensus.mjs";

// ── Test data ──────────────────────────────────────────────────────────────

const PLAN_ALL_AGREE = `## Decision
A

## Reasons
- Determinism matters for unit testing
- Zero extra LLM cost

## Risks / Trade-offs
- Jaccard threshold heuristic
`;

const PLAN_PARTIAL = `## Decision
A

## Reasons
- Determinism matters for unit testing
- Better than weighted majority option

## Risks / Trade-offs
- Jaccard threshold heuristic
`;

const PLAN_DIFFERENT = `## Decision
A

## Reasons
- Deterministic implementation
- Plan-only mode preserves dissent natively

## Risks / Trade-offs
- 0.8 body threshold brittle and possibly fragile
`;

const PLAN_DISAGREE_DECISION = `## Decision
C

## Reasons
- LLM judge is more flexible
- Handles semantic nuance

## Risks / Trade-offs
- Non-deterministic
`;

const threePlans = (a, b, c) => [
  { head: "h1", plan: a },
  { head: "h2", plan: b },
  { head: "h3", plan: c },
];

// ── 1. Determinism ─────────────────────────────────────────────────────────

test("T1: same input → identical agreement_score across 5 runs", () => {
  const plans = threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT);
  const scores = Array.from({ length: 5 }, () => consensus(plans).agreement_score);
  for (const s of scores) assert.equal(s, scores[0]);
});

test("T1b: same input → identical consensus_plan markdown across 5 runs", () => {
  const plans = threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT);
  const md = Array.from({ length: 5 }, () => consensus(plans).consensus_plan);
  for (const m of md) assert.equal(m, md[0]);
});

// ── 2. Decision unanimity multiplier ───────────────────────────────────────

test("T2: 3 heads agree on Decision → decisionMultiplier=1.5 applied", () => {
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT));
  assert.equal(r.decisionUnanimous, true);
  assert.equal(r.raw.decisionMultiplier, 1.5);
  assert.ok(r.agreement_score >= r.raw.rawScore, "boosted score >= rawScore");
});

test("T2b: 3 heads voiced on Decision but disagreed → decisionMultiplier=1.2 (v0.5.5 partial)", () => {
  // Pre-v0.5.5: case-2 decision → multiplier 1.0 (binary cliff from 1.5).
  // v0.5.5: soft-curve — 3-way decision tournament reflects "shared subject, divergent verdict"
  // (partial agreement, not zero). MEDIUM #1 from Opus 4.7 re-test.
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DISAGREE_DECISION));
  assert.equal(r.decisionUnanimous, false, "not case 1 unanimous");
  assert.equal(r.raw.decisionMultiplier, 1.2, "case-2 decision now triggers partial multiplier");
});

// ── 3. agreement_score ranges + label ─────────────────────────────────────

test("T3: completely identical plans → high agreement label", () => {
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_ALL_AGREE, PLAN_ALL_AGREE));
  // 3 identical plans → most groups are case 1, decision case 1 → score >= 0.7.
  assert.equal(r.label, "high", `expected 'high', got '${r.label}' (score=${r.agreement_score})`);
});

test("T3b: agreement_score is bounded in [0, 1]", () => {
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_DISAGREE_DECISION, PLAN_DIFFERENT));
  assert.ok(r.agreement_score >= 0, "score >= 0");
  assert.ok(r.agreement_score <= 1, "score <= 1");
});

// ── 4. Case-4 dissent classification ───────────────────────────────────────

test("T4: single-head risk → consensus_plan (conservative include)", () => {
  // h3 introduces a unique risk; h1/h2 don't mention it. Should appear in Risks section,
  // not dissent (kind=risk fast-path).
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT));
  assert.match(r.consensus_plan, /Risks/i);
  // "0.8 body threshold brittle" was h3-unique and a risk → should appear in plan.
  assert.ok(
    r.consensus_plan.includes("0.8 body threshold brittle") ||
    r.consensus_plan.toLowerCase().includes("brittle"),
    "h3-unique risk should be conservatively included"
  );
});

test("T5: single-head reason → consensus_plan (conservative include for reasons too)", () => {
  // h3 introduces "Plan-only mode preserves dissent natively" — h1/h2 don't mention it.
  // v0.5.1 enhancement: reasons get the same conservative include as risks.
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT));
  assert.match(r.consensus_plan, /Reasons/i);
  assert.ok(
    r.consensus_plan.toLowerCase().includes("preserves dissent"),
    "h3-unique reason should be included via case-4 conservative rule"
  );
});

// ── 5. Input validation ────────────────────────────────────────────────────

test("T6: consensus() rejects fewer than 3 plans", () => {
  assert.throws(() => consensus([{ head: "h1", plan: "..." }, { head: "h2", plan: "..." }]),
    /expected exactly 3 plans/);
});

test("T6b: consensus() rejects duplicate heads", () => {
  assert.throws(() => consensus([
    { head: "h1", plan: "..." },
    { head: "h1", plan: "..." },
    { head: "h3", plan: "..." },
  ]), /duplicate head/);
});

test("T6c: consensus() rejects unknown head", () => {
  assert.throws(() => consensus([
    { head: "h1", plan: "..." },
    { head: "h4", plan: "..." },  // invalid
    { head: "h3", plan: "..." },
  ]), /invalid head/);
});

// ── 6. extractTopics / jaccard primitives ──────────────────────────────────

test("T7: extractTopics finds Decision + Reasons + Risks sections", () => {
  const topics = extractTopics(PLAN_ALL_AGREE, "h1");
  assert.ok(topics.length >= 3, `expected >=3 topics, got ${topics.length}`);
  const kinds = new Set(topics.map((t) => t.kind));
  assert.ok(kinds.has("decision"), "decision kind present");
  assert.ok(kinds.has("reason"), "reason kind present");
  assert.ok(kinds.has("risk"), "risk kind present");
});

test("T7b: jaccard symmetric + range [0,1]", () => {
  const a = normalizeTokens("hello world test");
  const b = normalizeTokens("world test hello");
  const c = normalizeTokens("entirely unrelated content here");
  assert.equal(jaccard(a, b), 1, "permuted same tokens → 1");
  assert.equal(jaccard(a, c), 0, "no overlap → 0");
  assert.equal(jaccard(a, b), jaccard(b, a), "symmetric");
});

// ── 7. Dissent buckets exist + minimum keys ────────────────────────────────

test("T8: dissent object always has validated/disputed/missing/minority keys", () => {
  const r = consensus(threePlans(PLAN_ALL_AGREE, PLAN_PARTIAL, PLAN_DIFFERENT));
  for (const k of ["validated", "disputed", "missing", "minority"]) {
    assert.ok(Array.isArray(r.dissent[k]), `dissent.${k} should be array`);
  }
});
