// Unit tests for detectSignals (Tier 1 heuristic classifier) in
// install/detect-signals.mjs. Covers adversarial-defect detection (incl. style
// exclusion), multi-format chain detection (numbered / lettered /
// first-then-finally / inline Step N), strict-output detection (keywords +
// fenced blocks + quoted-key density), TDD + hard-reasoning signals, null-safe
// inputs, long-context threshold, and history-sourced α-ceiling.
//
// Run from repo root:
//   node --test install/fixtures/v05/unit/detect-signals.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectSignals } from "../../../detect-signals.mjs";

describe("detectSignals — adversarial defect", () => {
  test("race condition prompt flags adversarial only", () => {
    const s = detectSignals("Review this code for a race condition in the lock handling.", "");
    assert.equal(s.has_adversarial_defect, true);
    assert.equal(s.has_chain, false);
    assert.equal(s.has_strict_output, false);
    assert.equal(s.has_tdd, false);
    assert.equal(s.has_hard_reasoning, false);
  });

  test("XXE / XML parsing audit flags adversarial", () => {
    const s = detectSignals("Audit this XML parser for XXE injection vectors.", "");
    assert.equal(s.has_adversarial_defect, true);
    assert.equal(s.has_chain, false);
  });

  test("JWT vulnerability hunt flags adversarial", () => {
    const s = detectSignals("Find vulnerabilities in this JWT validation middleware.", "");
    assert.equal(s.has_adversarial_defect, true);
  });

  test("contradiction-finding flags adversarial", () => {
    const s = detectSignals("Find contradictions across these spec documents.", "");
    assert.equal(s.has_adversarial_defect, true);
  });

  // H5 policy: when adversarial signal AND style signal both appear, adversarial wins.
  // Previously this test asserted exclusion — Codex L6.1 review flagged the suppression as
  // dropping a legitimate adversarial intent, so the policy is now "adversarial wins".
  test("mixed 'find bugs and improve naming + formatting' preserves adversarial (H5)", () => {
    const s = detectSignals("Find bugs and improve naming + formatting in this module.", "");
    assert.equal(s.has_adversarial_defect, true);
  });

  test("pure style-only review (no adversarial token) is excluded", () => {
    const s = detectSignals("Improve naming and formatting in this module.", "");
    assert.equal(s.has_adversarial_defect, false);
  });
});

describe("detectSignals — chain detection", () => {
  test("numbered multiline chain (1./2./3.) flags has_chain", () => {
    const s = detectSignals("1. parse\n2. validate\n3. emit", "");
    assert.equal(s.has_chain, true);
  });

  test("lettered chain (A./B.) flags has_chain", () => {
    const s = detectSignals("A. foo\nB. bar", "");
    assert.equal(s.has_chain, true);
  });

  test("first-then-finally chain flags has_chain", () => {
    const s = detectSignals("First, do X. Then, do Y. Finally, do Z.", "");
    assert.equal(s.has_chain, true);
  });

  test("inline 'Step N:' chain flags has_chain", () => {
    const s = detectSignals("Step 1: parse. Step 2: validate.", "");
    assert.equal(s.has_chain, true);
  });
});

describe("detectSignals — strict output", () => {
  test("JSON fenced block + 4+ quoted keys flags has_strict_output", () => {
    const expected = '```json\n{ "a": 1, "b": 2, "c": 3, "d": 4 }\n```';
    const s = detectSignals("emit", expected);
    assert.equal(s.has_strict_output, true);
  });

  test("YAML keyword flags has_strict_output", () => {
    const s = detectSignals("Return the result as YAML.", "");
    assert.equal(s.has_strict_output, true);
  });

  test("CSV keyword flags has_strict_output", () => {
    const s = detectSignals("Output as csv with headers.", "");
    assert.equal(s.has_strict_output, true);
  });

  test("TS fenced block flags has_strict_output", () => {
    const s = detectSignals("emit", "```ts\nexport type X = { a: number };\n```");
    assert.equal(s.has_strict_output, true);
  });

  test("schema keyword flags has_strict_output", () => {
    const s = detectSignals("Conform to this schema strictly.", "");
    assert.equal(s.has_strict_output, true);
  });
});

describe("detectSignals — H4/H5/H6 regex hardening (Codex L6.1 findings)", () => {
  // H4: "table" alone with no output intent must NOT flag strict-output.
  test("H4: 'inspect routing table' alone does NOT flag has_strict_output", () => {
    const s = detectSignals("Inspect the routing table and explain packet loss.", "");
    assert.equal(s.has_strict_output, false);
  });
  test("H4: 'format as a table' DOES flag has_strict_output (output intent present)", () => {
    const s = detectSignals("Format the result as a table with one row per finding.", "");
    assert.equal(s.has_strict_output, true);
  });
  test("H4: 'return ... table' DOES flag has_strict_output", () => {
    const s = detectSignals("Return a markdown table with columns: severity, file, line.", "");
    assert.equal(s.has_strict_output, true);
  });

  // H5: mixed adversarial + style → adversarial wins.
  test("H5: 'find security bugs and naming issues' flags adversarial", () => {
    const s = detectSignals("Find security bugs and naming issues in auth middleware.", "");
    assert.equal(s.has_adversarial_defect, true);
  });
  test("H5: 'find subtle correctness bugs in the parser' flags adversarial (multi-word span)", () => {
    const s = detectSignals("Find subtle correctness bugs in the parser implementation.", "");
    assert.equal(s.has_adversarial_defect, true);
  });

  // H6: unquoted "fields: a, b, c" syntax → strict-output.
  test("H6: 'Return exactly fields: status, risk, file, line' flags strict-output", () => {
    const s = detectSignals("Return exactly fields: status, risk, file, line.", "");
    assert.equal(s.has_strict_output, true);
  });
  test("H6: 'columns: a, b, c, d' (4-tuple) flags strict-output", () => {
    const s = detectSignals("Emit a row with columns: name, version, date, author.", "");
    assert.equal(s.has_strict_output, true);
  });
  test("H6: short list 'fields: a, b' (only 2) does NOT flag strict-output by itself", () => {
    // 2-tuple is below the 3-min threshold to avoid false-positives on natural English.
    const s = detectSignals("Add fields: foo, bar to the response.", "");
    assert.equal(s.has_strict_output, false);
  });
});

describe("detectSignals — TDD + hard reasoning", () => {
  test("'make the failing test pass' flags has_tdd", () => {
    const s = detectSignals("Implement the function to make the failing test pass.", "");
    assert.equal(s.has_tdd, true);
  });

  test("NP-hard prompt flags has_hard_reasoning", () => {
    const s = detectSignals("Solve this NP-hard scheduling problem and prove that the result is optimal.", "");
    assert.equal(s.has_hard_reasoning, true);
  });

  // G5 fix: "edge cases" alone is NOT a TDD signal — common review phrase that previously misfired.
  test("'review for edge cases' alone does NOT flag has_tdd (G5 fix)", () => {
    const s = detectSignals("Review this parser for edge cases and production bugs.", "");
    assert.equal(s.has_tdd, false);
  });

  test("'edge case handling' alone does NOT flag has_tdd (G5 fix)", () => {
    const s = detectSignals("Document the edge case handling in this function.", "");
    assert.equal(s.has_tdd, false);
  });

  test("explicit 'tdd' keyword still flags has_tdd", () => {
    const s = detectSignals("Apply TDD: write a failing test first.", "");
    assert.equal(s.has_tdd, true);
  });
});

describe("detectSignals — null safety + length", () => {
  test("null prompt / undefined expectedOutput does not throw and all booleans false", () => {
    const s = detectSignals(null, undefined);
    assert.equal(s.has_chain, false);
    assert.equal(s.has_strict_output, false);
    assert.equal(s.has_adversarial_defect, false);
    assert.equal(s.has_tdd, false);
    assert.equal(s.has_hard_reasoning, false);
    assert.equal(s.known_alpha_ceiling, false);
    assert.equal(s.prompt_length, 0);
    assert.equal(s.is_long_context, false);
  });

  test("25KB prompt sets is_long_context and prompt_length > 20000", () => {
    const big = "a".repeat(25_000);
    const s = detectSignals(big, "");
    assert.equal(s.is_long_context, true);
    assert.equal(s.prompt_length > 20000, true);
  });
});

describe("detectSignals — history-sourced α ceiling", () => {
  test("history.task_profile_alpha_rate >= 0.95 flags known_alpha_ceiling", () => {
    const s = detectSignals("hello", "", { task_profile_alpha_rate: 0.97 });
    assert.equal(s.known_alpha_ceiling, true);
  });

  test("history.task_profile_alpha_rate < 0.95 does NOT flag known_alpha_ceiling", () => {
    const s = detectSignals("hello", "", { task_profile_alpha_rate: 0.5 });
    assert.equal(s.known_alpha_ceiling, false);
  });
});
