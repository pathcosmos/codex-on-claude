// Cerberus consensus algorithm (A) — Merge non-conflict + Tournament on conflicts.
// Spec: docs/cerberus-mode-spec.md (Draft 2 — PoC §4.2 feedback applied).
// Pure functions, no I/O, no deps. Deterministic for unit tests.

// ── Constants ──────────────────────────────────────────────────────────────
export const DEFAULTS = Object.freeze({
  headWeights: { h1: 1.0, h2: 1.0, h3: 1.5 },
  jaccardGroupThreshold: 0.6,
  bodyMergeThreshold: 0.8,
  topicKeyMaxChars: 100,
  decisionMultiplier: 1.5,
  // v0.5.5: case-2 decision (3 heads voiced on the same decision topic but disagreed on the
  // verdict — tournament fires) gets a partial multiplier instead of the binary cliff to 1.0.
  // Pre-v0.5.5 the only multiplier was 1.5 (case-1 unanimous) ↔ 1.0 (anything else); a single
  // word change in one head's decision could halve the agreement_score. With 1.2 the cliff
  // softens — case-2 decisions reflect "shared subject, divergent verdict" which is partial
  // agreement, not zero. See docs/cerberus-v0.5.4-plan.md MEDIUM #1.
  decisionPartialMultiplier: 1.2,
  // Specificity components (added to body-length score in tournament).
  specFileLine: 0.5,
  specNumber: 0.3,
  specListItemPer: 0.1,
  specListItemMax: 0.5,
  // Body-length score: log10(chars) / 10, capped.
  bodyLenScoreMax: 0.3,
  // case 4 (single-head) negation tokens — disqualify "validated" label.
  negationTokens: ["avoid", "don't", "do not", "not ", "skip", "never", "no need"],
});

// v0.5.3 fix #1: "not" REMOVED from STOPWORDS. Negation must not be silently swallowed during
// tokenization because that lets `"use cache"` and `"do not use cache"` collide. Polarity is now
// tracked per-topic (extractTopics computes a polarity flag) and groupByJaccard/case-merge
// require equal polarity. Token-level inclusion of "not" is acceptable — it falls out as a
// stem variant and contributes to Jaccard like any other word.
const STOPWORDS = new Set([
  "a","an","the","and","or","but","of","in","on","at","to","for","with","by","from",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","can","must","that","this","these","those",
  "it","its","as","if","then","else","than","so","very","just","also","too",
  // "not" intentionally NOT in this list — see polarity tracking below.
]);

// v0.5.3: polarity detection. A bullet whose body contains any of these tokens (word-bounded)
// is tagged polarity="-"; otherwise "+". Used by groupByJaccard / case-merge to refuse merging
// opposite-polarity topics — closes the n=2 self-review #1 finding.
const NEGATION_RE = /\b(not|never|avoid|skip|cannot|won't|wouldn't|shouldn't|don't|doesn't|didn't|no\s+need)\b/i;

// v0.5.5: contrast conjunction polarity (MEDIUM #3 from Opus 4.7 re-test). Pre-v0.5.5 the
// renderer silently merged "Cache reduces calls but introduces staleness" with "Cache reduces
// calls" under case 2 tournament — h3's neutral phrasing won and the caveat content was dropped
// from the consensus_plan entirely. Quantified: 4/5 conjunctions in run-md3 (060909Z-e8c149)
// produced exactly this caveat-loss pattern. Fix: tag the negation polarity when a contrast
// conjunction is followed by a substantive clause.
//
// False-positive guard: reciprocal expressions like "X but also Y", "X but additionally Y",
// "X but even Y", "X but too Y" stay polarity '+' (compatible expression, not contradiction).
// Negative lookahead `(?!(also|additionally|even|too)\b)` skips them.
//
// The trailing `\w+` requires a substantive clause — sentence-final "but," or trailing fragment
// is NOT a contradiction signal (very rare in plan markdown, but cheap to guard against).
const CONTRAST_NEGATION_RE = /\b(but|however|although|despite|except)\s+(?!(?:also|additionally|even|too)\b)\w+/i;

export function detectPolarity(text) {
  if (typeof text !== "string") return "+";
  if (NEGATION_RE.test(text)) return "-";
  if (CONTRAST_NEGATION_RE.test(text)) return "-";
  return "+";
}

// Bias toward h3 tie-break: define lex priority h3 > h1 > h2.
const HEAD_TIEBREAK_RANK = { h3: 0, h1: 1, h2: 2 };

// ── Porter Stemmer (pure JS, v0.5.2) ───────────────────────────────────────
// Reduces morphological variants to a common stem so Jaccard similarity catches paraphrases
// (e.g. "deterministic" / "deterministically" / "determinism" → "determin").
// Reference: Porter, M.F. "An algorithm for suffix stripping" (1980).

const VOWELS = new Set(["a","e","i","o","u"]);
// v0.5.3 fix #4: explicit base case for i < 0. Porter's rule: leading 'y' is a CONSONANT
// (e.g., "yellow", "young"). Previously isV(s, -1) returned VOWELS.has(undefined) === false,
// so y at i=0 was treated as VOWEL (`!false === true`) — Porter-incorrect. Now base case is
// false and the recursion respects "leading y = consonant".
const isV = (s, i) => {
  if (i < 0) return false;
  if (s[i] === "y") return !isV(s, i - 1);
  return VOWELS.has(s[i]);
};
const isC = (s, i) => !isV(s, i);

// Measure m: count of VC transitions in the prefix before suffix.
function measure(s) {
  let m = 0;
  let i = 0;
  while (i < s.length && isC(s, i)) i++;
  while (i < s.length) {
    while (i < s.length && isV(s, i)) i++;
    if (i >= s.length) break;
    m++;
    while (i < s.length && isC(s, i)) i++;
  }
  return m;
}

const hasVowel = (s) => { for (let i = 0; i < s.length; i++) if (isV(s, i)) return true; return false; };
const endsDouble = (s) => s.length >= 2 && s[s.length-1] === s[s.length-2] && isC(s, s.length-1);
const endsCVC = (s) => {
  if (s.length < 3) return false;
  const last = s[s.length-1];
  return isC(s, s.length-3) && isV(s, s.length-2) && isC(s, s.length-1) && !"wxy".includes(last);
};

function replaceSuffix(s, suffix, replacement, predicate) {
  if (!s.endsWith(suffix)) return null;
  const stem = s.slice(0, s.length - suffix.length);
  if (predicate && !predicate(stem)) return null;
  return stem + replacement;
}

export function stem(token) {
  if (typeof token !== "string" || token.length < 3) return token;
  let s = token.toLowerCase();

  // Step 1a: plurals.
  for (const [suf, rep] of [["sses","ss"],["ies","i"],["ss","ss"],["s",""]]) {
    if (s.endsWith(suf)) { s = s.slice(0, s.length - suf.length) + rep; break; }
  }

  // Step 1b: past tense / -ing.
  let step1bRan = false;
  if (s.endsWith("eed")) {
    const stemPart = s.slice(0, -3);
    if (measure(stemPart) > 0) s = stemPart + "ee";
  } else {
    let stripped = false;
    if (s.endsWith("ed") && hasVowel(s.slice(0, -2))) { s = s.slice(0, -2); stripped = true; }
    else if (s.endsWith("ing") && hasVowel(s.slice(0, -3))) { s = s.slice(0, -3); stripped = true; }
    if (stripped) {
      step1bRan = true;
      if (s.endsWith("at") || s.endsWith("bl") || s.endsWith("iz")) s += "e";
      else if (endsDouble(s) && !["l","s","z"].includes(s[s.length-1])) s = s.slice(0, -1);
      else if (measure(s) === 1 && endsCVC(s)) s += "e";
    }
  }

  // Step 1c: y → i.
  if (s.endsWith("y") && hasVowel(s.slice(0, -1))) s = s.slice(0, -1) + "i";

  // Step 2: m>0 maps.
  const step2 = [
    ["ational","ate"],["tional","tion"],["enci","ence"],["anci","ance"],["izer","ize"],
    ["bli","ble"],["alli","al"],["entli","ent"],["eli","e"],["ousli","ous"],
    ["ization","ize"],["ation","ate"],["ator","ate"],["alism","al"],["iveness","ive"],
    ["fulness","ful"],["ousness","ous"],["aliti","al"],["iviti","ive"],["biliti","ble"],
  ];
  for (const [suf, rep] of step2) {
    const cand = replaceSuffix(s, suf, rep, (stemPart) => measure(stemPart) > 0);
    if (cand !== null) { s = cand; break; }
  }

  // Step 3.
  for (const [suf, rep] of [["icate","ic"],["ative",""],["alize","al"],["iciti","ic"],["ical","ic"],["ful",""],["ness",""]]) {
    const cand = replaceSuffix(s, suf, rep, (stemPart) => measure(stemPart) > 0);
    if (cand !== null) { s = cand; break; }
  }

  // Step 4: m>1 deletions.
  const step4 = ["al","ance","ence","er","ic","able","ible","ant","ement","ment","ent",
                 "ou","ism","ate","iti","ous","ive","ize"];
  for (const suf of step4) {
    const cand = replaceSuffix(s, suf, "", (stemPart) => measure(stemPart) > 1);
    if (cand !== null) { s = cand; break; }
  }
  // Special: ion only after s or t.
  if (s.endsWith("ion")) {
    const stemPart = s.slice(0, -3);
    if (measure(stemPart) > 1 && /[st]$/.test(stemPart)) s = stemPart;
  }

  // Step 5a: final e.
  if (s.endsWith("e")) {
    const stemPart = s.slice(0, -1);
    const m = measure(stemPart);
    if (m > 1 || (m === 1 && !endsCVC(stemPart))) s = stemPart;
  }

  // Step 5b: double l.
  if (measure(s) > 1 && endsDouble(s) && s.endsWith("l")) s = s.slice(0, -1);

  return s;
}

// ── Tokenization & similarity ──────────────────────────────────────────────

export function normalizeTokens(text, opts = {}) {
  const { stem: useStem = true } = opts;
  if (typeof text !== "string") return [];
  const tokens = text
    .toLowerCase()
    .replace(/[*_`#>\[\]()]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9.:/-]/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return useStem ? tokens.map((t) => /^[a-z]+$/.test(t) ? stem(t) : t) : tokens;
}

export function jaccard(aTokens, bTokens) {
  if (!aTokens.length && !bTokens.length) return 1;
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// ── Topic extraction ───────────────────────────────────────────────────────

const KIND_KEYWORDS = [
  { kind: "decision",   pat: /\b(decision|choose|chosen|선택|결정|use\s+option|recommended|verdict)\b/i },
  { kind: "risk",       pat: /\b(risk|trade-?off|caveat|위험|단점|drawback|limitation)\b/i },
  { kind: "constraint", pat: /\b(constraint|must|required|requirement|제약)\b/i },
  { kind: "step",       pat: /\b(step|implement|add|wire|render|emit|bump|run)\b/i },
];

function classifyKind(text) {
  for (const { kind, pat } of KIND_KEYWORDS) if (pat.test(text)) return kind;
  return "note";
}

/** Strip markdown bold/italic markers from key text. */
function stripMarks(s) { return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"); }

/** First-sentence-or-100-chars topic key (Draft 2 §3.1). */
function topicKeyOf(text, maxChars = DEFAULTS.topicKeyMaxChars) {
  const cleaned = stripMarks(text).trim();
  const sentEnd = cleaned.search(/[.!?。](\s|$)/);
  const firstSentence = sentEnd >= 0 ? cleaned.slice(0, sentEnd) : cleaned;
  return (firstSentence.length <= maxChars ? firstSentence : firstSentence.slice(0, maxChars)).trim();
}

/**
 * extractTopics — parse markdown plan into a flat list of topics.
 * Each topic: { head, kind, topicKey, body, bodyTokens, listCount }
 *
 * Heuristics:
 * - "## "/"### " heading whose section follows → marks the kind for subsequent bullets when kind keyword matches
 * - "- " / "* " / numbered "1." prefixes → bullet → topic
 * - nested bullets under a parent count as listCount += 1 (specificity bonus)
 * - bold "**Decision**:" inline form → topic of kind=decision
 */
export function extractTopics(planText, head) {
  if (typeof planText !== "string") return [];
  const lines = planText.split("\n");
  const topics = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[2].toLowerCase();
      continue;
    }

    const bullet = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)$/);
    if (!bullet) continue;
    const indent = bullet[1].length;
    if (indent > 0) {
      // Nested bullet: bump listCount on previous topic.
      if (topics.length) topics[topics.length - 1].listCount += 1;
      continue;
    }

    const text = bullet[2];
    const kind = (() => {
      // Prefer section context if it implies a kind.
      if (currentSection) {
        if (/decision|결정/.test(currentSection)) return "decision";
        if (/risk|trade|위험/.test(currentSection)) return "risk";
        if (/constraint|제약/.test(currentSection)) return "constraint";
        if (/next step|implement|구현|단계/.test(currentSection)) return "step";
        if (/reason|이유|because|rationale/.test(currentSection)) return "reason";
      }
      return classifyKind(text);
    })();

    const topicKey = topicKeyOf(text);
    const body = stripMarks(text).trim();
    topics.push({
      head,
      kind,
      topicKey,
      body,
      bodyTokens: normalizeTokens(body),
      listCount: 0,
      polarity: detectPolarity(body), // v0.5.3 — block opposite-polarity false-merge
    });
  }

  // Also harvest a Decision topic when "## Decision\n<value>" pattern exists without bullets.
  // PoC observed H2 emitted "## Decision\nA" with no bullet — preserve as decision topic.
  const decMatch = planText.match(/##\s*Decision\s*\n+([^\n]+)/i);
  if (decMatch) {
    const text = decMatch[1].trim();
    if (text && !topics.some((t) => t.kind === "decision")) {
      topics.push({
        head, kind: "decision", topicKey: topicKeyOf(text), body: stripMarks(text),
        bodyTokens: normalizeTokens(text), listCount: 0,
        polarity: detectPolarity(text),
      });
    }
  }
  return topics;
}

// ── Grouping ────────────────────────────────────────────────────────────────

/**
 * groupByJaccard — cluster topics across heads where Jaccard(keyTokens) >= threshold.
 * Determinism: iterate in head order h1→h2→h3 and topic index ascending; first-encountered
 * group anchors the group's key tokens (no re-clustering after seeding).
 */
export function groupByJaccard(topicsByHead, threshold = DEFAULTS.jaccardGroupThreshold) {
  const groups = []; // { kindHint, anchorTokens, items: [topic...] }
  const order = ["h1", "h2", "h3"];

  for (const head of order) {
    const topics = topicsByHead[head] || [];
    for (const t of topics) {
      const keyTokens = normalizeTokens(t.topicKey);
      // Try to attach to existing group of same kind (or "note" → universal).
      let best = -1;
      let bestSim = 0;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        // Don't merge across decision/risk/step/constraint boundaries — keeps signal clean.
        // Exception: "note" can absorb anything but is least preferred.
        if (g.kindHint !== t.kind && g.kindHint !== "note" && t.kind !== "note") continue;
        // Already has this head — skip (one head, one topic per group).
        if (g.items.some((it) => it.head === t.head)) continue;
        // v0.5.3 fix #1: refuse merging across opposite polarities. "use cache" (+) and "do not
        // use cache" (-) must land in different groups even when token similarity is high.
        if (g.polarity !== t.polarity) continue;
        // v0.5.3 fix #2: refuse empty-token false-merge outside decision groups. jaccard([],[])
        // returns 1 (needed for single-char decision labels A/B/C) but that semantics would
        // mis-merge any non-decision short bullet that tokenizes to empty (Korean, single-word,
        // pure-stopword). Decision groups get a separate exact-body path in consensus().
        if (g.anchorTokens.length === 0 && keyTokens.length === 0 && g.kindHint !== "decision") continue;
        const sim = jaccard(g.anchorTokens, keyTokens);
        if (sim >= threshold && sim > bestSim) {
          bestSim = sim;
          best = gi;
        }
      }
      if (best >= 0) {
        groups[best].items.push(t);
        // Promote kind from "note" to a stronger label if a real kind appears.
        if (groups[best].kindHint === "note" && t.kind !== "note") groups[best].kindHint = t.kind;
      } else {
        groups.push({ kindHint: t.kind, anchorTokens: keyTokens, items: [t], polarity: t.polarity });
      }
    }
  }
  return groups;
}

// ── Tournament scoring ──────────────────────────────────────────────────────

function bodyLenScore(body) {
  const chars = (body || "").length;
  if (chars <= 0) return 0;
  const raw = Math.log10(chars) / 10;
  return Math.min(DEFAULTS.bodyLenScoreMax, raw);
}

function specificityScore(body, listCount) {
  let score = 0;
  if (/[a-zA-Z0-9_./-]+\.[a-z]{1,5}:\d+/.test(body)) score += DEFAULTS.specFileLine;
  else if (/\/[A-Za-z0-9_./-]+\b/.test(body) && /\.\w{1,5}\b/.test(body)) score += DEFAULTS.specFileLine;
  if (/\b\d+(\.\d+)?\b/.test(body)) score += DEFAULTS.specNumber;
  score += Math.min(DEFAULTS.specListItemMax, (listCount || 0) * DEFAULTS.specListItemPer);
  return score;
}

function tournamentScore(item, weights) {
  const w = weights[item.head] ?? 1.0;
  return w * (bodyLenScore(item.body) + specificityScore(item.body, item.listCount));
}

function tieBreak(items) {
  // Stable: by HEAD_TIEBREAK_RANK ascending.
  return [...items].sort((a, b) => HEAD_TIEBREAK_RANK[a.head] - HEAD_TIEBREAK_RANK[b.head])[0];
}

// ── Case 4 dissent classification ───────────────────────────────────────────

function hasNegationFor(otherHeadsTopics, topicTokens) {
  for (const other of otherHeadsTopics) {
    const sim = jaccard(normalizeTokens(other.topicKey), topicTokens);
    if (sim < 0.3) continue;
    const lowered = other.body.toLowerCase();
    if (DEFAULTS.negationTokens.some((n) => lowered.includes(n))) return true;
  }
  return false;
}

function classifyCase4(item, allTopicsByHead) {
  const others = ["h1", "h2", "h3"].filter((h) => h !== item.head).flatMap((h) => allTopicsByHead[h] || []);
  const itemTokens = normalizeTokens(item.topicKey);
  // Disputed: another head explicitly negates this topic.
  if (hasNegationFor(others, itemTokens)) return "disputed";
  // Otherwise validated (no other head spoke against it).
  return "validated";
}

// ── Consensus driver ────────────────────────────────────────────────────────

/**
 * consensus(plans, options) → { consensus_plan, agreement_score, dissent, chosen_per_topic, raw }
 *
 * @param plans — array of exactly 3 entries: [{ head, plan }, ...] where head ∈ {h1,h2,h3}.
 *                plan can be a string (markdown) or { text } / { plan: string } shape.
 * @param options — { headWeights, jaccardGroupThreshold, bodyMergeThreshold } overrides.
 */
export function consensus(plans, options = {}) {
  const opt = { ...DEFAULTS, ...options, headWeights: { ...DEFAULTS.headWeights, ...(options.headWeights || {}) } };
  if (!Array.isArray(plans) || plans.length !== 3) {
    throw new Error("consensus: expected exactly 3 plans");
  }
  const validHeads = new Set(["h1", "h2", "h3"]);
  const seen = new Set();
  for (const p of plans) {
    if (!p || !validHeads.has(p.head)) throw new Error(`consensus: invalid head "${p?.head}"`);
    if (seen.has(p.head)) throw new Error(`consensus: duplicate head "${p.head}"`);
    seen.add(p.head);
  }

  const topicsByHead = { h1: [], h2: [], h3: [] };
  for (const p of plans) {
    const planText = typeof p.plan === "string" ? p.plan : (p.plan?.text || p.plan?.plan || "");
    topicsByHead[p.head] = extractTopics(planText, p.head);
  }

  const groups = groupByJaccard(topicsByHead, opt.jaccardGroupThreshold);

  // Classify each group → consensus item or dissent.
  const merged = [];      // case 1+2: makes it into consensus_plan
  const chosenPerTopic = [];
  const dissent = { validated: [], disputed: [], minority: [], missing: [] };

  let case1 = 0, case2 = 0, case3 = 0, case4 = 0;
  let decisionCase1 = false;
  let decisionCase2 = false; // v0.5.5: tracks "3 heads voiced on decision topic but disagreed"

  for (const g of groups) {
    const heads = new Set(g.items.map((it) => it.head));
    const headCount = heads.size;
    if (headCount === 3) {
      // Special case: Decision groups are matched by exact body string equality, not Jaccard.
      // Short Decision bodies like "A" / "B" / "C" tokenize to empty sets (single-char tokens
      // are filtered by normalizeTokens), so token-based similarity is meaningless for them.
      if (g.kindHint === "decision") {
        const bodyStrs = g.items.map((it) => it.body.trim());
        const allMatch = bodyStrs.every((b) => b === bodyStrs[0]);
        if (allMatch) {
          case1++;
          decisionCase1 = true;
          merged.push({ kind: "decision", body: bodyStrs[0], case: 1, contributors: ["h1","h2","h3"] });
          chosenPerTopic.push({ topic: bodyStrs[0], winner: "merged", reason: "3 heads agree on decision (exact body match)" });
        } else {
          case2++;
          decisionCase2 = true; // v0.5.5: triggers partial multiplier
          // Decision disagreement → tournament with weights, h3 tie-break.
          const scored = g.items.map((it) => ({ it, score: tournamentScore(it, opt.headWeights) }));
          scored.sort((a, b) => (b.score - a.score) || (HEAD_TIEBREAK_RANK[a.it.head] - HEAD_TIEBREAK_RANK[b.it.head]));
          const winner = scored[0].it;
          merged.push({ kind: "decision", body: winner.body, case: 2, winner: winner.head, contributors: ["h1","h2","h3"] });
          chosenPerTopic.push({ topic: winner.body, winner: winner.head, reason: `decision tournament: heads disagreed (h1=${bodyStrs[0]}, h2=${bodyStrs[1]}, h3=${bodyStrs[2]})` });
          for (const s of scored.slice(1)) {
            dissent.disputed.push({ topic: s.it.body, head: s.it.head, body: s.it.body, lostTo: winner.head, score: s.score });
          }
        }
        continue;
      }
      // case 1 vs case 2: pairwise body similarity check.
      const bodies = g.items.map((it) => it.bodyTokens);
      const sims = [jaccard(bodies[0], bodies[1]), jaccard(bodies[0], bodies[2]), jaccard(bodies[1], bodies[2])];
      const minSim = Math.min(...sims);
      if (minSim >= opt.bodyMergeThreshold) {
        case1++;
        if (g.kindHint === "decision") decisionCase1 = true;
        // Pick longest body as canonical merged text (or h3 if tied).
        const byLen = [...g.items].sort((a, b) => b.body.length - a.body.length);
        const canonical = byLen[0].body.length === byLen[1].body.length ? tieBreak(g.items) : byLen[0];
        merged.push({ kind: g.kindHint, body: canonical.body, case: 1, contributors: [...heads].sort() });
        chosenPerTopic.push({ topic: g.items[0].topicKey, winner: "merged", reason: `3 heads agree (min Jaccard=${minSim.toFixed(2)})` });
      } else {
        case2++;
        if (g.kindHint === "decision") decisionCase2 = true; // v0.5.5: paraphrased-decision tournament
        // Tournament: highest weighted score wins; tie → h3>h1>h2.
        const scored = g.items.map((it) => ({ it, score: tournamentScore(it, opt.headWeights) }));
        scored.sort((a, b) => (b.score - a.score) || (HEAD_TIEBREAK_RANK[a.it.head] - HEAD_TIEBREAK_RANK[b.it.head]));
        const winner = scored[0].it;
        merged.push({ kind: g.kindHint, body: winner.body, case: 2, winner: winner.head, contributors: [...heads].sort() });
        chosenPerTopic.push({ topic: winner.topicKey, winner: winner.head, reason: `tournament: score=${scored[0].score.toFixed(2)}, runners-up=[${scored.slice(1).map((s) => `${s.it.head}=${s.score.toFixed(2)}`).join(",")}]` });
        for (const s of scored.slice(1)) {
          dissent.disputed.push({ topic: s.it.topicKey, head: s.it.head, body: s.it.body, lostTo: winner.head, score: s.score });
        }
      }
    } else if (headCount === 2) {
      case3++;
      // 2 heads agreeing on a topic is itself signal — don't punish the loser as "disputed".
      // Pick higher-weighted body for canonical rendering; record missing head for transparency.
      const scored = g.items.map((it) => ({ it, score: tournamentScore(it, opt.headWeights) }));
      scored.sort((a, b) => (b.score - a.score) || (HEAD_TIEBREAK_RANK[a.it.head] - HEAD_TIEBREAK_RANK[b.it.head]));
      const winner = scored[0].it;
      merged.push({ kind: g.kindHint, body: winner.body, case: 3, winner: winner.head, contributors: [...heads].sort() });
      chosenPerTopic.push({ topic: winner.topicKey, winner: winner.head, reason: `2-head agreement (${[...heads].sort().join("+")}); canonical body from ${winner.head}` });
      const missingHead = ["h1","h2","h3"].find((h) => !heads.has(h));
      if (missingHead) dissent.missing.push({ topic: g.items[0].topicKey, missingHead });
    } else if (headCount === 1) {
      case4++;
      const item = g.items[0];
      if (item.kind === "risk" || item.kind === "reason") {
        // Conservative: include single-head risks and reasons in consensus_plan.
        // Reasons matter for plan-only output — empty Reasons section is useless to user.
        merged.push({ kind: item.kind, body: item.body, case: 4, contributors: [item.head], note: `single-head ${item.kind} (conservative include)` });
        chosenPerTopic.push({ topic: item.topicKey, winner: item.head, reason: `single-head ${item.kind} — conservative inclusion` });
      } else if (item.kind === "step" || item.kind === "decision") {
        const bucket = classifyCase4(item, topicsByHead);
        dissent[bucket].push({ topic: item.topicKey, head: item.head, body: item.body, kind: item.kind });
      } else {
        dissent.minority.push({ topic: item.topicKey, head: item.head, body: item.body, kind: item.kind });
      }
    }
  }

  const totalGroups = case1 + case2 + case3 + case4;
  // v0.5.2: case 4 conservative include (risk/reason kinds make it into consensus_plan).
  // These deserve partial credit equal to case 3 (0.3) — they're not zero-signal even though only
  // one head contributed. case 4 step/decision items stay in dissent and contribute 0.
  const case4Conservative = merged.filter((m) => m.case === 4).length;
  const case4Other = case4 - case4Conservative;
  const rawScore = totalGroups
    ? (case1 * 1.0 + case2 * 0.5 + case3 * 0.3 + case4Conservative * 0.3 + case4Other * 0.0) / totalGroups
    : 0;
  // v0.5.5: soft-curve — case 1 unanimous → 1.5x, case 2 tournament → 1.2x, else 1.0x.
  // decisionCase1 takes precedence (a plan with both unanimous Decision A and a paraphrase-
  // tournament Decision B in the same call still gets full credit for the unanimous one).
  const decisionMultiplier = decisionCase1
    ? opt.decisionMultiplier
    : (decisionCase2 ? opt.decisionPartialMultiplier : 1.0);
  const agreement_score = Math.min(1.0, rawScore * decisionMultiplier);

  let label;
  if (agreement_score >= 0.7) label = "high";
  else if (agreement_score >= 0.4) label = "moderate";
  else label = "low";

  return {
    agreement_score: Number(agreement_score.toFixed(3)),
    label,
    decisionUnanimous: decisionCase1,
    consensus_plan: renderConsensusPlan(merged, dissent, agreement_score, label),
    chosen_per_topic: chosenPerTopic,
    dissent,
    raw: {
      groupCounts: { case1, case2, case3, case4, case4Conservative, case4Other, total: totalGroups },
      rawScore: Number(rawScore.toFixed(3)),
      decisionMultiplier,
    },
  };
}

// ── Markdown rendering ──────────────────────────────────────────────────────

function renderConsensusPlan(merged, dissent, score, label) {
  const sections = {
    decision: [], reason: [], constraint: [], risk: [], step: [], section: [], note: [],
  };
  for (const m of merged) {
    const bucket = (sections[m.kind] ? m.kind : "note");
    sections[bucket].push(m);
  }
  // Section ordering: decision → reasons → constraints → risks → steps → dissent.
  // (Reasons drawn ONLY from explicit "reason" kind; notes fall through to "Additional" section below.)

  const out = [];
  out.push(`**Cerberus consensus** (agreement: ${score.toFixed(2)}, label: ${label})`);
  if (label === "low") out.push(`> ⚠ Heads disagreed on most topics — user review recommended.`);
  out.push("");

  if (sections.decision.length) {
    out.push("## Decision");
    for (const d of sections.decision) out.push(`${d.body}`);
    out.push("");
  }

  if (sections.reason.length) {
    out.push("## Reasons");
    for (const r of sections.reason) {
      const noteSuffix = r.note ? ` _(${r.note})_` : "";
      out.push(`- ${r.body}${tagContributors(r)}${noteSuffix}`);
    }
    out.push("");
  }

  if (sections.risk.length) {
    out.push("## Risks / Trade-offs");
    for (const r of sections.risk) out.push(`- ${r.body}${tagContributors(r)}${r.note ? ` _(${r.note})_` : ""}`);
    out.push("");
  }

  if (sections.constraint.length) {
    out.push("## Constraints");
    for (const c of sections.constraint) out.push(`- ${c.body}${tagContributors(c)}`);
    out.push("");
  }

  if (sections.step.length) {
    out.push("## Next Steps");
    for (const s of sections.step) out.push(`- ${s.body}${tagContributors(s)}`);
    out.push("");
  }

  // v0.5.3 fix #3: render all four dissent buckets including minority (previously omitted)
  // and guard against missing lostTo in disputed entries.
  if (dissent.validated.length || dissent.disputed.length || dissent.missing.length || dissent.minority.length) {
    out.push("## Dissent");
    if (dissent.validated.length) {
      out.push("### Validated (single-head suggestions — no opposition)");
      for (const d of dissent.validated) out.push(`- \`[${d.head}]\` ${d.body}`);
    }
    if (dissent.disputed.length) {
      out.push("### Disputed (lost in tournament)");
      for (const d of dissent.disputed) {
        // v0.5.4: case-4 step/decision pushed by classifyCase4() has no tournament winner →
        // lostTo undefined. Distinguish from tournament loss with a polarity-explicit suffix.
        const suffix = d.lostTo
          ? `*(lost to ${d.lostTo})*`
          : `*(disputed — opposing polarity)*`;
        out.push(`- \`[${d.head}]\` ${d.body}  ${suffix}`);
      }
    }
    if (dissent.minority.length) {
      out.push("### Minority (single-head note/step, not actionable consensus)");
      for (const d of dissent.minority) out.push(`- \`[${d.head}]\` ${d.body}`);
    }
    if (dissent.missing.length) {
      out.push("### Missing-head topics");
      for (const d of dissent.missing) out.push(`- ${d.topic}  *(missing: ${d.missingHead})*`);
    }
    out.push("");
  }

  return out.join("\n").trim() + "\n";
}

function tagContributors(item) {
  const c = item.contributors || [];
  if (!c.length) return "";
  return `  _(${c.join("+")})_`;
}
