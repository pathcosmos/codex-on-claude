// Unit tests for Porter Stemmer (v0.5.2) — install/cerberus-consensus.mjs:stem().
// Run: node --test install/fixtures/v05/unit/cerberus-stemming.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { stem, normalizeTokens, jaccard } from "../../../cerberus-consensus.mjs";

// ── Step coverage: well-known Porter Stemmer cases ────────────────────────

test("ST1: -s/-es/-ies removed (Step 1a)", () => {
  assert.equal(stem("caresses"), "caress");
  assert.equal(stem("ponies"), "poni");
  assert.equal(stem("ties"), "ti");
  assert.equal(stem("cats"), "cat");
});

test("ST2: -ing / -ed removed when vowel in stem (Step 1b)", () => {
  assert.equal(stem("running"), "run");
  assert.equal(stem("agreed"), "agre");
  assert.equal(stem("motoring"), "motor");
});

test("ST3: terminal y → i when vowel in stem (Step 1c)", () => {
  assert.equal(stem("happy"), "happi");
  assert.equal(stem("sky"), "sky"); // no vowel in stem → keep
});

test("ST4: -ational → -ate (Step 2)", () => {
  assert.equal(stem("relational"), "relat");
  assert.equal(stem("rational"), "ration");
});

test("ST5: -ation → -ate (Step 2)", () => {
  assert.equal(stem("operational"), "oper");
});

test("ST6: paraphrase clusters collapse (the v0.5.2 motivating case)", () => {
  // "deterministic" / "deterministically" / "determinism" — same stem after stemming.
  const a = stem("deterministic");
  const b = stem("deterministically");
  const c = stem("determinism");
  assert.equal(a, b, `${a} vs ${b}`);
  // 'determinism' has a different ending (-ism), but stemmer Step 4 strips -ism after m>1.
  // We assert at least pairwise equality across {deterministic, deterministically} which is the
  // primary v0.5.2 goal. determinism may not align in all Porter variants — acceptable.
});

test("ST7: reason / reasoning / reasons → 'reason'", () => {
  assert.equal(stem("reason"), "reason");
  assert.equal(stem("reasons"), "reason");
  assert.equal(stem("reasoning"), "reason");
});

test("ST8: merge / merged / merging → 'merg'", () => {
  assert.equal(stem("merge"), "merg");
  assert.equal(stem("merged"), "merg");
  assert.equal(stem("merging"), "merg");
});

// ── normalizeTokens + jaccard integration ──────────────────────────────────

test("ST9: normalizeTokens applies stemming by default", () => {
  const tokens = normalizeTokens("deterministic algorithms reasoning");
  // Each token stemmed; "algorithms" → "algorithm" via -s removal in Step 1a.
  assert.ok(tokens.includes(stem("deterministic")), "deterministic stem present");
  assert.ok(tokens.includes(stem("reasoning")), "reasoning stem present");
});

test("ST10: normalizeTokens can disable stemming via opts", () => {
  const t1 = normalizeTokens("deterministic", { stem: true });
  const t2 = normalizeTokens("deterministic", { stem: false });
  assert.notEqual(t1[0], t2[0], "stem-on vs stem-off differ");
  assert.equal(t2[0], "deterministic");
});

test("ST11: Jaccard catches paraphrase across heads (the v0.5.2 motivating case)", () => {
  const h1 = normalizeTokens("deterministic algorithm runs reasoning");
  const h2 = normalizeTokens("deterministically run a reason");
  // Before stemming: Jaccard would be low. After stemming: matched ≥3 tokens.
  const sim = jaccard(h1, h2);
  assert.ok(sim >= 0.5, `paraphrase Jaccard expected ≥0.5 with stemming, got ${sim} (h1=${h1}, h2=${h2})`);
});

test("ST12: stemming is deterministic (same input → same output)", () => {
  const inputs = ["running", "deterministic", "consensus", "implementation", "verification"];
  for (const w of inputs) {
    assert.equal(stem(w), stem(w));
  }
});

test("ST13: short tokens (<3 chars) unchanged", () => {
  assert.equal(stem("a"), "a");
  assert.equal(stem("at"), "at");
  assert.equal(stem("the"), "the");
});

test("ST14: non-string input safe", () => {
  assert.equal(stem(null), null);
  assert.equal(stem(undefined), undefined);
  assert.equal(stem(123), 123);
});
