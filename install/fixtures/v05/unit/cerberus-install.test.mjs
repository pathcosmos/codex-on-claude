// Unit tests for Cerberus install integration — manifest schema + agent isolation + opt-in (v0.5.1).
// Run: `node --test install/fixtures/v05/unit/cerberus-install.test.mjs`

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_DIR = path.resolve(here, "../../..");      // .../install
const MANIFEST = path.join(INSTALL_DIR, "manifest.json");
const AGENTS_DIR = path.join(INSTALL_DIR, "components", "agents");
const SKILLS_DIR = path.join(INSTALL_DIR, "components", "skills");

async function readJson(p) { return JSON.parse(await fs.readFile(p, "utf8")); }
async function readText(p) { return fs.readFile(p, "utf8"); }

// ── 1. Manifest schema (mcp array + cerberus question + cerberusAgents) ───

test("M1: manifest.mcp is an array containing codex + cerberus", async () => {
  const m = await readJson(MANIFEST);
  assert.ok(Array.isArray(m.mcp), "manifest.mcp must be an array (v0.5.1)");
  const names = m.mcp.map((s) => s.name);
  assert.ok(names.includes("codex"), "codex MCP present");
  assert.ok(names.includes("cerberus"), "cerberus MCP present");
});

test("M2: cerberus MCP entry has the correct stdio command + registerCommand", async () => {
  const m = await readJson(MANIFEST);
  const cerb = m.mcp.find((s) => s.name === "cerberus");
  assert.equal(cerb.command, "codex-on-claude");
  assert.deepEqual(cerb.args, ["mcp-server", "cerberus"]);
  assert.match(cerb.registerCommand, /claude mcp add --scope user cerberus/);
});

test("M3: manifest.questions.cerberus is a single-select with off/on choices + defaults block", async () => {
  const m = await readJson(MANIFEST);
  const q = m.questions.cerberus;
  assert.equal(q.type, "single");
  const keys = q.choices.map((c) => c.key);
  assert.deepEqual(keys.sort(), ["off", "on"]);
  // off.enable === false, on.enable === true
  assert.equal(q.choices.find((c) => c.key === "off").enable, false);
  assert.equal(q.choices.find((c) => c.key === "on").enable, true);
  // defaults block carries tuning knobs (spec §6).
  assert.ok(q.defaults, "defaults block present");
  assert.equal(q.defaults.scope, "head");
  assert.equal(q.defaults.consensus, "merge-then-tournament");
  assert.deepEqual(q.defaults.headWeights, { h1: 1.0, h2: 1.0, h3: 1.5 });
});

test("M4: cerberusAgents array has exactly 3 heads + correct source paths", async () => {
  const m = await readJson(MANIFEST);
  assert.ok(Array.isArray(m.cerberusAgents), "cerberusAgents must be an array");
  assert.equal(m.cerberusAgents.length, 3);
  const names = m.cerberusAgents.map((a) => a.name).sort();
  assert.deepEqual(names, ["cerberus-h1-claude-only", "cerberus-h2-codex-only", "cerberus-h3-synergy"]);
  // Each must point to a file under components/agents/.
  for (const a of m.cerberusAgents) {
    assert.match(a.source, /^components\/agents\/cerberus-h[123]-.+\.md$/);
    assert.match(a.target, /^agents\/cerberus-h[123]-.+\.md$/);
  }
});

test("M5: skills.codex-cerberus is registered with correct source/target", async () => {
  const m = await readJson(MANIFEST);
  assert.ok(m.skills["codex-cerberus"], "codex-cerberus skill entry present");
  assert.equal(m.skills["codex-cerberus"].source, "components/skills/codex-cerberus");
  assert.equal(m.skills["codex-cerberus"].target, "skills/codex-cerberus");
});

// ── 2. Agent frontmatter — head isolation via tools allowlist ─────────────

async function frontmatter(filePath) {
  const txt = await readText(filePath);
  const m = txt.match(/^---\n([\s\S]+?)\n---/);
  if (!m) throw new Error(`No frontmatter in ${filePath}`);
  const obj = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_-]+):\s*(.*)$/i);
    if (kv) obj[kv[1]] = kv[2];
  }
  return obj;
}

test("ISO1: H1 (claude-only) tools allowlist EXCLUDES mcp__codex__*", async () => {
  const fm = await frontmatter(path.join(AGENTS_DIR, "cerberus-h1-claude-only.md"));
  const tools = fm.tools || "";
  assert.ok(!tools.includes("mcp__codex__codex"), `H1 must not allow mcp__codex__codex; got: ${tools}`);
  assert.ok(!tools.includes("mcp__codex"), `H1 must not allow any mcp__codex__* tool`);
  // But Claude's own reasoning tools should be present.
  assert.match(tools, /Read/, "H1 must allow Read");
});

test("ISO2: H2 (codex-only) tools allowlist INCLUDES mcp__codex__codex and EXCLUDES write tools", async () => {
  const fm = await frontmatter(path.join(AGENTS_DIR, "cerberus-h2-codex-only.md"));
  const tools = fm.tools || "";
  assert.match(tools, /mcp__codex__codex/, "H2 must allow mcp__codex__codex");
  // H2 must not have Bash/Edit/Write — its job is to relay Codex, not reason.
  assert.ok(!/\bBash\b/.test(tools), "H2 must not allow Bash");
  assert.ok(!/\bEdit\b/.test(tools), "H2 must not allow Edit");
  assert.ok(!/\bWrite\b/.test(tools), "H2 must not allow Write");
});

test("ISO3: H3 (synergy) tools allowlist includes BOTH mcp__codex__codex AND Bash", async () => {
  const fm = await frontmatter(path.join(AGENTS_DIR, "cerberus-h3-synergy.md"));
  const tools = fm.tools || "";
  assert.match(tools, /mcp__codex__codex/, "H3 must allow mcp__codex__codex (synergy)");
  assert.match(tools, /\bBash\b/, "H3 must allow Bash (synergy)");
});

test("ISO4: all 3 heads use model placeholder {{reviewerPrimaryModel}}", async () => {
  for (const name of ["cerberus-h1-claude-only", "cerberus-h2-codex-only", "cerberus-h3-synergy"]) {
    const fm = await frontmatter(path.join(AGENTS_DIR, `${name}.md`));
    // Templater substitutes at install time — source file should contain the placeholder.
    assert.match(fm.model || "", /\{\{reviewerPrimaryModel\}\}/, `${name} should use templater placeholder`);
  }
});

// ── 3. Skill prose minimal contract ────────────────────────────────────────

test("SKILL1: codex-cerberus SKILL.md references the three required MCP tools", async () => {
  const txt = await readText(path.join(SKILLS_DIR, "codex-cerberus", "SKILL.md"));
  assert.match(txt, /mcp__cerberus__init/, "init reference");
  assert.match(txt, /mcp__cerberus__consensus/, "consensus reference");
  // Must instruct parallel spawn of three agents.
  assert.match(txt, /parallel/i, "must mention parallel agent spawn");
});

test("SKILL2: codex-cerberus SKILL.md does NOT encode the consensus algorithm itself", async () => {
  // The merge/tournament logic must live in the MCP server (cerberus-consensus.mjs), not in prose.
  // This guards against the memory feedback `feedback_skill_actual_vs_documented` regression.
  const txt = await readText(path.join(SKILLS_DIR, "codex-cerberus", "SKILL.md"));
  assert.ok(!/Jaccard/.test(txt), "SKILL.md must not describe Jaccard algorithm — it belongs in the server");
  assert.ok(!/headWeights/.test(txt), "SKILL.md must not describe head weights — server-side concern");
});

// ── 4. Patterns choices should NOT contain a 'cerberus' key (v0.5.1 design) ─

test("PAT1: manifest.questions.patterns.choices does NOT include cerberus (separate opt-in)", async () => {
  const m = await readJson(MANIFEST);
  const keys = m.questions.patterns.choices.map((c) => c.key);
  assert.ok(!keys.includes("cerberus"), "cerberus is now a separate question, not a pattern");
});
