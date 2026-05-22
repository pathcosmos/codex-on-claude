// codex-on-claude — Tier 1 signal detection (v0.5.0)
//
// Pure heuristic classifier ($0). Reads a user prompt + optional expected output schema
// and returns a signals object that the auto-mode decision tree consumes. Designed to be
// called from Skill prose (via Bash) or from the gate sub-command when richer signal data
// is needed. Spec lives in docs/usage-mode-config.md (Tier 1: Heuristic detection).
//
// Codex peer-reviewed: null-safe inputs, multi-format chain detection (numbered / lettered
// / first-then-finally / step variants), structured-output detection covers YAML / CSV /
// schema / TS in addition to JSON, has_adversarial_defect excludes pure style review,
// known_alpha_ceiling sourced from history (NOT prompt regex).

// Chain steps — covers line-start markers AND inline "Step N:" / "step N." patterns
// commonly seen in single-line prompts. Word-boundary anchored to avoid false matches.
const CHAIN_REGEX = /(?:^|\s)(?:\d+[.)]\s+|[A-Z][.)]\s+|first[,:]\s|then[,:]\s|finally[,:]\s|step\s+\d+[:.)]?\s)/gim;
// H4 fix: "table" alone is too ambiguous (e.g. "inspect the routing table" misclassifies as
// strict-output). Require output-intent context: "as a table", "return ... table", "format ... table",
// "output ... table", or a markdown table delimiter `|`-only line.
const STRICT_OUTPUT_KEYWORDS = /\b(valid\s+json|json\s+only|no\s+prose|schema|required\s+fields|yaml|csv|fenced\s+block|(?:as|return|emit|format|output)(?:\s+\w+){0,4}\s+(?:a\s+)?table\b)\b/i;
const STRICT_FENCED = /```(json|yaml|ts|typescript|jsonc|json5)\b/;
const STRICT_FIELDS = /"[\w_]+"\s*:/g;
// H6 fix + M1 pre-ship boundary clarification: detect "fields: a, b, c, d" / "return fields:
// status, risk, file, line" style — unquoted schema spec that L1 STRICT_FIELDS regex missed.
// Threshold: ≥4 comma-separated identifiers (3 commas) — high enough to avoid false-positives
// on common English ("add fields: foo, bar to the response") yet catch real schema specs.
const STRICT_FIELD_LIST = /\b(?:fields?|keys?|columns?)\s*:\s*[\w_]+(?:\s*,\s*[\w_]+){3,}/i;
// L1 finding: original keywords missed plural forms ("race conditions", "failing tests"). Plural-tolerant now.
// H5 fix: allow up to ~30 chars between "find" and the defect noun so prompts like
// "find security bugs and naming issues" or "find subtle correctness bugs in the parser" still
// fire. Sentence boundary stops the span (no `.`, no `?`, no `!`).
const ADVERSARIAL_DEFECT = /\bfind\b[^.?!]{0,40}\b(?:bugs?|issues?|vulnerabilit(?:y|ies)|contradictions?|edge\s+cases?|race\s+conditions?|defects?|flaws?)\b|\b(?:security\s+(?:audit|bugs?|vulnerabilit(?:y|ies)|review)|adversarial|race\s+conditions?|injection|xss|xxe|tocttou|toctou|prototype\s+pollution|ssrf|csrf|deserialization)\b/i;
const STYLE_ONLY = /\b(style|format|readability|naming|lint(?:ing)?|prettier|eslint)\b/i;
// H3 pre-ship fix: the H5 policy ("adversarial wins on any match") over-matched on benign
// "find ... issues" prompts (e.g. "find open issues in GitHub", "find naming issues" → R1).
// Require a STRONG defect token (security/bug/defect/race/injection/vulnerability/contradiction)
// for the adversarial signal to fire when "issues" or "edge cases" is the only defect noun.
const STRONG_DEFECT = /\b(security|bugs?|defects?|flaws?|race(?:\s+condition)?s?|injection|xss|xxe|tocttou|toctou|vulnerabilit(?:y|ies)|contradictions?|prototype\s+pollution|ssrf|csrf|deserialization|adversarial)\b/i;
// G5 fix: removed `edge cases` from TDD signals — it's a general review concern, not TDD-specific.
// True TDD signals are failing tests / make tests pass / explicit "tdd" keyword.
const TDD = /\b(failing\s+tests?|tdd|implement\s+to\s+pass|make\s+the\s+(?:failing\s+)?tests?\s+pass)\b/i;
const HARD_REASONING = /\b(np-hard|constraint\s+satisf|sat\s+solver|puzzle|prove\s+that|algorithm\s+correctness|formal\s+verification)\b/i;

/**
 * detectSignals — Tier 1 heuristic classification.
 *
 * @param {string|null|undefined} prompt        The user's task prompt.
 * @param {string|null|undefined} expectedOutput Optional expected-output schema or sample.
 * @param {object} [history]                    Optional history cache:
 *                                              { task_profile_alpha_rate?: number }
 * @returns {object} signals — see fields below.
 */
export function detectSignals(prompt, expectedOutput, history = {}) {
  const text = `${prompt || ""}\n${expectedOutput || ""}`;
  const expected = expectedOutput || "";

  // Chain steps — multi-format (numbered "1.", lettered "A.", first/then/finally, step N).
  const chainMatches = text.match(CHAIN_REGEX) || [];
  const has_chain = chainMatches.length >= 2;

  // Structured output detection — JSON / YAML / CSV / TS schema, fenced blocks, or
  // many quoted keys in the expected output sample. H6 adds unquoted "fields: a, b, c" syntax.
  const has_strict_output =
    STRICT_OUTPUT_KEYWORDS.test(text) ||
    STRICT_FENCED.test(expected) ||
    STRICT_FIELD_LIST.test(text) ||
    ((expected.match(STRICT_FIELDS) || []).length >= 4);

  // H5 + H3 pre-ship policy: adversarial fires when ADVERSARIAL_DEFECT matches AND there's a
  // STRONG defect token in scope. This keeps "Find security bugs and naming issues" adversarial
  // (security + bugs are strong) while excluding "Find naming issues" / "Find open issues in
  // GitHub" / "Find edge cases in the spec" (none have strong defect tokens).
  //
  // The STRONG_DEFECT check protects against the "find ... issues|edge cases" over-match where
  // the secondary defect noun is too generic on its own.
  const adversarialMatches = ADVERSARIAL_DEFECT.test(text);
  const styleMatches = STYLE_ONLY.test(text);
  const strongDefect = STRONG_DEFECT.test(text);
  const has_adversarial_defect = adversarialMatches && strongDefect;
  // Notes:
  // - mixed adversarial + style: both adversarialMatches AND strongDefect typically true → adversarial wins.
  // - pure style-only ("Improve naming"): adversarialMatches false → false.
  // - weak adversarial ("Find open issues in GitHub"): adversarialMatches true but strongDefect false → false.
  void styleMatches; // retained for future policy iteration; intentionally unused.

  const has_tdd = TDD.test(text);
  const has_hard_reasoning = HARD_REASONING.test(text);

  // α-ceiling can only be inferred from cached history (NOT regex from the prompt).
  const known_alpha_ceiling = typeof history?.task_profile_alpha_rate === "number"
    && history.task_profile_alpha_rate >= 0.95;

  const promptLen = (prompt || "").length;

  return {
    has_chain,
    has_strict_output,
    has_adversarial_defect,
    has_tdd,
    has_hard_reasoning,
    known_alpha_ceiling,
    prompt_length: promptLen,
    is_long_context: promptLen > 20000,
  };
}

/**
 * applyDecisionTree — translates signals + mode into a recipe recommendation.
 * Mirrors the Quick-Ref 3-Q tree from docs/guidance-quick-ref.md.
 *
 * @param {object} signals  Output of detectSignals.
 * @param {string} mode     'none' | 'synergy' | 'auto' | 'max'
 * @returns {object}        { recipe: 'block'|'R1'|'R4'|'R5'|'R6'|'alpha', reason, confidence }
 */
export function applyDecisionTree(signals, mode = "synergy") {
  if (mode === "none") {
    return { recipe: "block", reason: "usageMode=none; Codex calls are blocked at the gate.", confidence: 1.0 };
  }

  // Q1 — α ceiling escape
  if (signals.known_alpha_ceiling && !signals.has_adversarial_defect) {
    return { recipe: "alpha", reason: "Known α ceiling for this task profile — β math bounded ≤ 0.", confidence: 0.9 };
  }

  // Q2 — Chain + strict output catastrophe trap (P5)
  if (signals.has_chain && signals.has_strict_output) {
    if (mode === "max") {
      return { recipe: "R4", reason: "P-Chain-JSON Trap detected; max-mode triggers γ hot-swap (R4).", confidence: 0.95 };
    }
    return { recipe: "R6", reason: "Chain + strict output detected. Use R6 Format-Safe Handoff (Codex prose → Claude format).", confidence: 0.9 };
  }

  // Q3 — Adversarial defect-finding review
  if (signals.has_adversarial_defect) {
    return { recipe: "R1", reason: "Adversarial defect-finding review detected — R1 expected +6~+30pp.", confidence: 0.85 };
  }

  // Q4 — Hard reasoning + verifiable answer
  if (signals.has_hard_reasoning) {
    return { recipe: "R3", reason: "Hard reasoning / verifiable answer — R3 reasoning=high recommended.", confidence: 0.75 };
  }

  // Q5 — TDD impl
  if (signals.has_tdd) {
    return { recipe: "R3", reason: "TDD impl with failing tests — R3 reasoning=high.", confidence: 0.7 };
  }

  // Auto-mode cheap β probe when no clear signal
  if (mode === "max") {
    return { recipe: "R5", reason: "Max mode probes by default (adjudication: adopt only source-grounded Codex findings).", confidence: 0.6 };
  }
  if (mode === "auto") {
    return { recipe: "alpha", reason: "No strong signal; Tier 2 LLM probe may refine if confidence < threshold.", confidence: 0.5 };
  }

  return { recipe: "alpha", reason: "No β-favorable signals; α default.", confidence: 0.8 };
}

/**
 * computeConfidence — convenience wrapper combining detect + tree.
 */
export function computeConfidence(prompt, expectedOutput, mode, history) {
  const signals = detectSignals(prompt, expectedOutput, history);
  const decision = applyDecisionTree(signals, mode);
  return { signals, decision };
}

// CLI entry point — `node detect-signals.mjs '<prompt>' [expected]`
// Reads prompt from CLI args or stdin, prints JSON to stdout.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argPrompt = process.argv[2];
  const argExpected = process.argv[3];
  const argMode = process.argv[4] || "synergy";
  const main = async () => {
    let prompt = argPrompt;
    if (!prompt && !process.stdin.isTTY) {
      let buf = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) buf += chunk;
      prompt = buf;
    }
    const result = computeConfidence(prompt || "", argExpected || "", argMode);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  };
  main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
}
