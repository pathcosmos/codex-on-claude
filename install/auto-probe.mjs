// codex-on-claude — Tier 2 LLM probe (v0.5.0)
//
// Invoked from auto-mode Skill prose when Tier 1 heuristic confidence < 0.7 AND
// config.autoTier2LLMProbe === true. Asks Codex CLI for a meta-classification of the task
// (~$0.01-0.02 per probe) and merges the result back into the decision tree.
//
// Spec: docs/usage-mode-config.md "Tier 2: LLM-judged on ambiguous"

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, ".claude", "codex-on-claude");
const LOG_FILE = path.join(STATE_DIR, "logs", "auto-probe.jsonl");

const CLASSIFIER_PROMPT = `Classify this task into one of: chain-strict | adversarial-review | tdd | reasoning | doc-authoring | other.
Estimate α (Claude alone) success rate roughly: high (>90%) / medium (50-90%) / low (<50%).
Reply with one fenced JSON block only, no prose:
\`\`\`json
{ "task_type": "...", "alpha_estimate": "high|medium|low", "rationale": "<≤15 words>" }
\`\`\`

Task prompt:
`;

const ALLOWED_TASK_TYPES = new Set(["chain-strict", "adversarial-review", "tdd", "reasoning", "doc-authoring", "other"]);
const ALLOWED_ALPHA = new Set(["high", "medium", "low"]);

function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

async function logProbe(entry) {
  try {
    // M2 fix: chmod parent dir to 0700 best-effort. logProbe may run before applyInstallation
    // (e.g. on a fresh install where the log dir hasn't been created yet).
    const dir = path.dirname(LOG_FILE);
    await fs.mkdir(dir, { recursive: true });
    try { await fs.chmod(dir, 0o700); } catch { /* best-effort */ }
    await fs.appendFile(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch { /* best-effort */ }
}

/**
 * invokeCodexClassifier — Tier 2 probe.
 *
 * @param {string} prompt      First ~500 chars of the user's task prompt are sent.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=20000]
 * @param {boolean} [opts.skipIfUnavailable=true] — return null instead of throwing when codex CLI is missing.
 * @returns {Promise<object|null>} { task_type, alpha_estimate, rationale } or null on failure.
 */
export async function invokeCodexClassifier(prompt, opts = {}) {
  const { timeoutMs = 20000, skipIfUnavailable = true } = opts;
  const codex = which("codex");
  if (!codex) {
    await logProbe({ event: "skip-no-codex", prompt_chars: (prompt || "").length });
    if (skipIfUnavailable) return null;
    throw new Error("codex CLI not on PATH");
  }
  const short = (prompt || "").slice(0, 500);
  const fullPrompt = CLASSIFIER_PROMPT + short;

  const start = Date.now();
  const r = spawnSync(codex, [
    "exec",
    "--sandbox=read-only",
    "--skip-git-repo-check",
    "--json",
    fullPrompt,
  ], {
    encoding: "utf8",
    timeout: timeoutMs,
    input: "", // close stdin explicitly — codex CLI hangs on piped stdin
  });
  const elapsedMs = Date.now() - start;

  if (r.error || r.status !== 0) {
    await logProbe({ event: "error", elapsedMs, status: r.status, signal: r.signal || null, stderr: (r.stderr || "").slice(0, 200) });
    return null;
  }

  // L6.1 fix: `codex exec --json` emits JSON Lines (one event per line), NOT a single
  // document with embedded markdown. The fenced block (if any) lives inside an
  // `agent_message` event payload. Previous code regexed the raw stdout for ```json which
  // never matched the JSONL stream → every valid response became `parse-fail`.
  //
  // New strategy:
  //   1. Parse stdout line-by-line as JSONL.
  //   2. Collect text from any event whose type contains "agent_message" or whose payload has
  //      a `message` / `content` / `text` field. Concatenate.
  //   3. Search the combined message text for the fenced JSON block.
  //   4. If no fenced block but the message itself is a JSON object with the right shape, use it.
  //   5. Fall back to scanning the raw stdout (legacy behavior) so this still works for non-JSON
  //      output modes.
  const text = r.stdout || "";
  const messageChunks = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      const kind = String(evt?.type || evt?.event || evt?.kind || "").toLowerCase();
      if (kind.includes("agent_message") || kind.includes("assistant") || kind === "message") {
        const piece = evt?.message?.content || evt?.message?.text || evt?.content || evt?.text || evt?.message;
        if (typeof piece === "string") messageChunks.push(piece);
        else if (Array.isArray(piece)) {
          for (const p of piece) {
            if (typeof p === "string") messageChunks.push(p);
            else if (typeof p?.text === "string") messageChunks.push(p.text);
          }
        }
      }
    } catch {
      // Not JSONL — possibly the older plain-text mode. Append the line itself.
      messageChunks.push(line);
    }
  }
  const combined = messageChunks.join("\n") || text; // last-ditch fallback to raw stdout

  let parsed;
  const fenceMatch = combined.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { parsed = JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }
  if (!parsed) {
    // Try the entire combined text as a JSON document.
    const trimmed = combined.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try { parsed = JSON.parse(trimmed); } catch { /* still null */ }
    }
  }
  if (!parsed) {
    await logProbe({ event: "parse-fail", elapsedMs, stdout_chars: text.length, combined_chars: combined.length });
    return null;
  }

  if (!ALLOWED_TASK_TYPES.has(parsed.task_type) || !ALLOWED_ALPHA.has(parsed.alpha_estimate)) {
    await logProbe({ event: "invalid-classification", elapsedMs, parsed });
    return null;
  }

  await logProbe({ event: "success", elapsedMs, task_type: parsed.task_type, alpha_estimate: parsed.alpha_estimate });
  return parsed;
}

/**
 * shouldProbe — checks config + Tier 1 confidence threshold.
 *
 * @param {object} config       Parsed config.json (choices.usageMode + choices.autoTier2LLMProbe).
 * @param {object} tier1Result  Output from detect-signals.applyDecisionTree (contains confidence).
 * @param {number} [threshold=0.7]
 * @returns {boolean}
 */
export function shouldProbe(config, tier1Result, threshold = 0.7) {
  const mode = config?.choices?.usageMode;
  if (mode !== "auto") return false;
  if (config?.choices?.autoTier2LLMProbe === false) return false;
  return (tier1Result?.confidence ?? 0) < threshold;
}

/**
 * mergeClassification — folds Codex classification back into the decision tree result.
 *
 * H4 fix (pre-ship audit): now takes `mode` so the chain-strict branch respects the F5 rule:
 *   - synergy / auto → R6 Format-Safe Handoff (gentler escalation)
 *   - max            → R4 γ hot-swap (more aggressive, matches applyDecisionTree behavior)
 *
 * Without `mode`, chain-strict + max via the Tier 2 path was returning R6, contradicting the
 * Tier 1 path (which correctly returned R4) and producing inconsistent UX in max mode.
 *
 * @param {object}      tier1Result    detect-signals decision.
 * @param {object|null} classification invokeCodexClassifier result (or null).
 * @param {string}      [mode='synergy'] usage-mode for max-aware routing.
 * @returns {object}                   adjusted decision.
 */
export function mergeClassification(tier1Result, classification, mode = "synergy") {
  if (!classification) return tier1Result;
  // H4 fix: chain-strict routes by mode (R4 in max, R6 elsewhere) — mirrors applyDecisionTree.
  const chainStrictRecipe = mode === "max" ? "R4" : "R6";
  const chainStrictReason = mode === "max"
    ? "Tier 2 classified chain-strict; max mode triggers R4 γ hot-swap."
    : "Tier 2 classified chain-strict → R6 Format-Safe Handoff.";
  const map = {
    "chain-strict":       { recipe: chainStrictRecipe, confidence: 0.85, reason: chainStrictReason },
    "adversarial-review": { recipe: "R1", confidence: 0.85, reason: "Tier 2 classified adversarial review → R1." },
    "tdd":                { recipe: "R3", confidence: 0.8,  reason: "Tier 2 classified TDD → R3 reasoning=high." },
    "reasoning":          { recipe: "R3", confidence: 0.8,  reason: "Tier 2 classified hard reasoning → R3." },
    "doc-authoring":      { recipe: "R2", confidence: 0.75, reason: "Tier 2 classified complex doc authoring → R2 self-review (conditional)." },
    "other":              { recipe: tier1Result.recipe, confidence: tier1Result.confidence, reason: tier1Result.reason },
  };
  const refined = map[classification.task_type] || tier1Result;
  return {
    ...tier1Result,
    ...refined,
    tier2: classification,
  };
}

// CLI entry point — `node auto-probe.mjs '<prompt>'` for local testing.
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2] || "";
  invokeCodexClassifier(prompt).then((res) => {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  }).catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
}
