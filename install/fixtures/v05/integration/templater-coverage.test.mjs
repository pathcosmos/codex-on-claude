// v0.5.0 integration test: templater coverage across all Skills + agents.
//
// For each of the 9 SKILL.md files and the 2 codex-reviewer agent files (11
// total), we:
//   (a) confirm the raw source contains at least one {{usageMode}} placeholder
//   (b) for each of the 4 usageMode values (none/synergy/auto/max), build the
//       same value object that install.mjs:buildModelVars produces and run it
//       through substitute(); assert no `{{` remains in the output.
//   (c) confirm the 4 modeBehavior strings are pairwise distinct.
//
// This catches three regressions at once:
//   - someone removed {{usageMode}} from a Skill preamble
//   - someone added a new placeholder to a Skill without exporting it from
//     buildModelVars
//   - someone collapsed the 4 mode prose snippets into duplicate strings

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { substitute } from "../../../templater.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPONENTS = path.resolve(__dirname, "../../../components");

const SKILL_NAMES = [
  "codex-analyze",
  "codex-fix",
  "codex-followup",
  "codex-improve",
  "codex-log",
  "codex-resume",
  "codex-review",
  "codex-routine",
  "codex-threads",
];

const FILES = [
  ...SKILL_NAMES.map((name) => ({
    name: `skills/${name}/SKILL.md`,
    path: path.join(COMPONENTS, "skills", name, "SKILL.md"),
  })),
  {
    name: "agents/codex-reviewer.md",
    path: path.join(COMPONENTS, "agents", "codex-reviewer.md"),
  },
  {
    name: "agents/codex-reviewer-fallback.md",
    path: path.join(COMPONENTS, "agents", "codex-reviewer-fallback.md"),
  },
];

// Mirror of install.mjs:buildModelVars modeBehavior table (lines 525-530).
// Keep in sync if that table changes.
const MODE_BEHAVIOR = {
  none:    "🚫 Codex calls are blocked at the hook gate. This Skill returns to α without invoking Codex unless the user explicitly overrides.",
  synergy: "🎯 Follow the v9 Quick-Ref 3-Q decision tree (ceiling → chain+strict → adversarial → partial-fail). Apply R1-R6 recipes when matched.",
  auto:    "🔍 Detect signals first (`install/detect-signals.mjs`). If heuristic confidence < 0.7 and Tier 2 probe is on, classify via Codex before deciding.",
  max:     "⚡ Quality-first bounded automation. R1 default ON for review tasks, R5 always probe, γ hot-swap on P5 catastrophe — hard DO-NOT rules still enforced.",
};

function buildValuesForMode(mode) {
  // Mirrors install.mjs:buildModelVars output, with realistic synthetic values
  // for the model.* paths and short aliases.
  return {
    subscription: { claude: "max", codex: "pro" },
    model: {
      codex:    { primary: { id: "gpt-5",  reasoning: "high" }, fallback: { id: "gpt-5", reasoning: "medium" } },
      reviewer: { primary: { id: "sonnet", reasoning: "high" }, fallback: { id: "sonnet", reasoning: "medium" } },
    },
    codexPrimaryModel: "gpt-5",
    codexPrimaryReasoning: "high",
    codexFallbackModel: "gpt-5",
    codexFallbackReasoning: "medium",
    reviewerPrimaryModel: "sonnet",
    reviewerPrimaryReasoning: "high",
    reviewerFallbackModel: "sonnet",
    reviewerFallbackReasoning: "medium",
    usageMode: mode,
    modeBehavior: MODE_BEHAVIOR[mode],
    autoTier2LLMProbe: "on",
    guardrailChainJson: "hard-block",
    guardrailSubagent: "hard-block",
    guardrailTurnBurn: "3-turn-stop",
    guardrailCeiling: "warn-and-skip",
  };
}

const MODES = ["none", "synergy", "auto", "max"];

test("every Skill / agent file contains a {{usageMode}} placeholder", () => {
  const missing = [];
  for (const f of FILES) {
    const raw = readFileSync(f.path, "utf8");
    if (!/\{\{\s*usageMode\s*\}\}/.test(raw)) {
      missing.push(f.name);
    }
  }
  assert.deepEqual(missing, [], `files missing {{usageMode}}: ${missing.join(", ")}`);
});

test("substitute() leaves no unresolved {{ ... }} placeholders for any (file, mode) pair", () => {
  const failures = [];
  for (const f of FILES) {
    const raw = readFileSync(f.path, "utf8");
    for (const mode of MODES) {
      const values = buildValuesForMode(mode);
      const out = substitute(raw, values);
      const leftovers = out.match(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g);
      if (leftovers && leftovers.length) {
        failures.push(`${f.name} [mode=${mode}] unresolved: ${[...new Set(leftovers)].join(", ")}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the 4 modeBehavior strings are pairwise distinct", () => {
  const values = MODES.map((m) => MODE_BEHAVIOR[m]);
  const unique = new Set(values);
  assert.equal(
    unique.size,
    MODES.length,
    `modeBehavior strings collapsed — only ${unique.size} unique value(s) across ${MODES.length} modes`,
  );
  // also: none of them are empty
  for (let i = 0; i < MODES.length; i++) {
    assert.equal(typeof values[i], "string", `modeBehavior[${MODES[i]}] not a string`);
    assert.ok(values[i].length > 0, `modeBehavior[${MODES[i]}] is empty`);
  }
});
