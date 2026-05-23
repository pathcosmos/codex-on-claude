// Cerberus per-machine config seed + reader. v0.5.5.
//
// Before v0.5.5, `cerberus-server.mjs:loadConfig()` read `cfg?.choices?.cerberus` and
// pattern-matched it as an object — but `choices.cerberus` is the enum "on"/"off". The fallback
// object literal was never reachable, so headWeights / jaccardGroupThreshold / etc. were locked
// at DEFAULTS regardless of what users put in config.json. The seed in this module gives users a
// visible, edit-ready stub; the reader returns the merged consensus options that actually flow
// into runConsensus().
//
// Pure functions, no I/O, no deps. Easy to unit-test.
//
// Schema (v0.5.5):
//   choices.cerberusConfig = {
//     headWeights:                 { h1: number, h2: number, h3: number }  // optional
//     jaccardGroupThreshold:       number 0..1                              // optional
//     bodyMergeThreshold:          number 0..1                              // optional
//     decisionMultiplier:          number ≥ 1.0                             // optional
//     decisionPartialMultiplier:   number ≥ 1.0  (v0.5.5+)                  // optional
//     costCapTokens:               number ≥ 0                               // optional
//   }
//
// Any unspecified field falls back to `install/cerberus-consensus.mjs:DEFAULTS`. The seed is an
// empty object by default — users edit ~/.claude/codex-on-claude/config.json directly.

/**
 * seedCerberusConfig — ensures `choices.cerberusConfig` exists when cerberus opt-in is ON.
 * Preserves any prior user-set object via nullish coalescing — never overwrites.
 *
 * @param {object} choices — the in-flight install/reconfigure choices object.
 * @returns {object} the same choices (mutated in place AND returned for chaining).
 */
export function seedCerberusConfig(choices) {
  if (!choices || typeof choices !== "object") return choices;
  if (choices.cerberus !== "on") return choices;
  choices.cerberusConfig = choices.cerberusConfig ?? {};
  return choices;
}

/**
 * consensusOptsFromConfig — extract runConsensus options from a saved config.json shape.
 * Only emits keys whose values are defined — never overrides DEFAULTS with `undefined` (which
 * would happen with naive `{ ...DEFAULTS, ...opts }` spread).
 *
 * @param {object} cfg — the parsed config.json contents.
 * @returns {object} options object suitable for `consensus(plans, opts)`.
 */
export function consensusOptsFromConfig(cfg) {
  const cc = cfg?.choices?.cerberusConfig;
  const opts = {};
  if (!cc || typeof cc !== "object") return opts;
  if (cc.headWeights && typeof cc.headWeights === "object") opts.headWeights = cc.headWeights;
  if (typeof cc.jaccardGroupThreshold === "number") opts.jaccardGroupThreshold = cc.jaccardGroupThreshold;
  if (typeof cc.bodyMergeThreshold === "number") opts.bodyMergeThreshold = cc.bodyMergeThreshold;
  if (typeof cc.decisionMultiplier === "number") opts.decisionMultiplier = cc.decisionMultiplier;
  if (typeof cc.decisionPartialMultiplier === "number") opts.decisionPartialMultiplier = cc.decisionPartialMultiplier;
  return opts;
}

/**
 * costCapFromConfig — extract per-run token cap. Server uses this independently of consensus opts.
 *
 * @param {object} cfg — the parsed config.json contents.
 * @returns {number} the cost cap (default 50000).
 */
export function costCapFromConfig(cfg) {
  const cc = cfg?.choices?.cerberusConfig;
  if (cc && typeof cc.costCapTokens === "number" && cc.costCapTokens >= 0) return cc.costCapTokens;
  return 50000;
}
