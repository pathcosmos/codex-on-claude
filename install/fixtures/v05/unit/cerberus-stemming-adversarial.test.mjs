// Adversarial unit tests for Porter Stemmer (v0.5.2) — measures over-stemming risk.
// v0.5.3 backlog reference: stemming collisions for semantically distinct words can cause
// false case-1/case-2 merges → inflated agreement_score. These tests document the known
// limitation surface so consumers can decide when to switch to embedding-based similarity.
// Run: node --test install/fixtures/v05/unit/cerberus-stemming-adversarial.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { stem, normalizeTokens, jaccard } from "../../../cerberus-consensus.mjs";

// ── Known over-stemming collisions (semantically distinct → same stem) ────
// Each entry = ["word_a", "word_b", "shared_stem"]
// These are EXPECTED to collide under the v0.5.2 Porter Stemmer. We document them so future
// adopters know which token shapes risk false-merging across heads. Spec §3.2 references this list.

const KNOWN_COLLISIONS = [
  ["general",      "generic",      "gener"],
  ["general",      "generation",   "gener"],
  ["generic",      "generation",   "gener"],
  ["operate",      "operation",    "oper"],     // shared root, but operation can be a noun unrelated to "operate"
  ["operative",    "operation",    "oper"],
  ["cooperate",    "cooperation",  "cooper"],
  ["relate",       "relational",   "relat"],
  ["universal",    "universe",     "univers"],
  ["business",     "busy",         "busi"],     // CRITICAL: business and busy have distinct semantics
  ["national",     "nation",       "nation"],
  ["nature",       "natural",      "natur"],
  ["nature",       "naturally",    "natur"],
  ["assist",       "assistance",   "assist"],
  ["assist",       "assistant",    "assist"],
  ["new",          "news",         "new"],      // CRITICAL: "news" → "new" loses signal
  ["secure",       "security",     "secur"],
  ["organize",     "organization", "organ"],
  ["organize",     "organic",      "organ"],    // CRITICAL: "organize" and "organic" semantics
  ["digit",        "digital",      "digit"],
  // True intended cluster (control — should also collide):
  ["deterministic","deterministically","determinist"],
  ["reason",       "reasoning",    "reason"],
];

const TOTAL_KNOWN = KNOWN_COLLISIONS.length;

// ── Adversarial assertions ─────────────────────────────────────────────────

test("AS1: KNOWN over-stemming collisions match v0.5.2 spec §3.2 limitation list", () => {
  // Each known pair should produce the documented shared stem. If a future stemmer change
  // breaks this list, the spec must be updated and embedding fallback re-evaluated.
  for (const [a, b, shared] of KNOWN_COLLISIONS) {
    const sa = stem(a), sb = stem(b);
    assert.equal(sa, shared, `stem("${a}") expected "${shared}", got "${sa}"`);
    assert.equal(sb, shared, `stem("${b}") expected "${shared}", got "${sb}"`);
    assert.equal(sa, sb, `${a}/${b} expected to collide on "${shared}"`);
  }
});

test("AS2: critical false-merge candidates surface in normalizeTokens", () => {
  // The 4 highest-risk semantic divergences for plan-level text:
  const criticalPairs = [
    ["business", "busy"],
    ["new", "news"],
    ["organize", "organic"],
    ["general", "generic"],
  ];
  for (const [a, b] of criticalPairs) {
    const ta = normalizeTokens(a);
    const tb = normalizeTokens(b);
    assert.ok(jaccard(ta, tb) === 1,
      `Critical pair ${a}/${b} should collide under v0.5.2 stemming — Jaccard=${jaccard(ta,tb)}`);
  }
});

test("AS3: false-merge risk surfaces at the stem level (gener-cluster)", () => {
  // Demonstrate the practical impact: a plan from h1 using "general" + h2 using "generic" +
  // h3 using "generation" all stem-collide on "gener". When clustered with other shared
  // surrounding tokens, the topic would erroneously be classified as case 1 (3-head agree).
  const h1Stem = stem("general");
  const h2Stem = stem("generic");
  const h3Stem = stem("generation");
  assert.equal(h1Stem, "gener");
  assert.equal(h2Stem, "gener");
  assert.equal(h3Stem, "gener");
  // Equivalent token IS present in all three normalized streams:
  const t1 = normalizeTokens("general purpose framework");
  const t2 = normalizeTokens("generic library approach");
  const t3 = normalizeTokens("generation utility design");
  assert.ok(t1.includes("gener"), `t1 should contain "gener"; got ${JSON.stringify(t1)}`);
  assert.ok(t2.includes("gener"), `t2 should contain "gener"; got ${JSON.stringify(t2)}`);
  assert.ok(t3.includes("gener"), `t3 should contain "gener"; got ${JSON.stringify(t3)}`);
});

test("AS4: control — intended paraphrase clusters still work (positive case)", () => {
  // The over-stemming surface is not 100% bad: it correctly groups intended paraphrases too.
  // This is the trade-off documented in spec §3.2.
  assert.equal(stem("deterministic"), stem("deterministically"));
  assert.equal(stem("reason"), stem("reasoning"));
  assert.equal(stem("verify"), "verifi");
  // Note: "verification" stems to "verif" — NOT same as "verify" → "verifi". v0.5.2 underspecified.
  assert.notEqual(stem("verify"), stem("verification"),
    "Known under-stemming gap: verify/verification do NOT collide despite shared meaning");
});

// ── Mitigation hints ──────────────────────────────────────────────────────

test("AS5: stem opt-out flag prevents false-merges (cost: paraphrase miss)", () => {
  // For applications where paraphrase recall is less important than precision,
  // normalizeTokens({stem: false}) keeps tokens literal. Documented escape hatch.
  const t1 = normalizeTokens("business idea", { stem: false });
  const t2 = normalizeTokens("busy schedule", { stem: false });
  assert.equal(jaccard(t1, t2), 0, "without stemming, business/busy do not collide");
});

test(`AS6: known collision count is ${TOTAL_KNOWN} (regression guard for spec §3.2 table)`, () => {
  // If a future Porter implementation change reduces collisions, the spec table must be updated.
  // Treat this as a deliberate snapshot.
  assert.equal(TOTAL_KNOWN, 21, "spec §3.2 v0.5.2 lists exactly 21 documented collisions");
});
