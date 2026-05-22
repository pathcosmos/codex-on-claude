// G7 fix verification — ruleUsageModeDrift must ignore log entries before config.updatedAt.
//
// Strategy: import the module + export the rule indirectly via runAnalyze, OR test the pure
// function by re-importing from analyze.mjs. We use the direct import path since analyze.mjs
// re-exports the runAnalyze API, but the rule itself is module-private. So we drive the test
// through runAnalyze with controlled tempdir state.
//
// Run via:
//   node --test install/fixtures/v05/unit/rule-usage-mode-drift.test.mjs

import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const installerPath = path.join(repoRoot, "install/install.mjs");

let tmpHome;

async function setup(modeAndAge) {
  // modeAndAge: { mode, configUpdatedAt, entries: [{ts, tool, ...}] }
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "coc-drift-rule-"));
  const stateDir = path.join(tmpHome, ".claude", "codex-on-claude");
  await fs.mkdir(path.join(stateDir, "logs"), { recursive: true });
  const config = {
    version: "0.5.0",
    choices: { usageMode: modeAndAge.mode, improvementLoop: "manual" },
    updatedAt: modeAndAge.configUpdatedAt,
  };
  await fs.writeFile(path.join(stateDir, "config.json"), JSON.stringify(config));
  // Write entries as a daily log JSONL file
  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(stateDir, "logs", `usage-${today}.jsonl`);
  const entries = modeAndAge.entries.map((e) => JSON.stringify(e)).join("\n");
  await fs.writeFile(logFile, entries + (entries ? "\n" : ""));
}

async function teardown() {
  if (tmpHome && (tmpHome.startsWith("/tmp/") || tmpHome.startsWith("/var/folders/"))) {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
  tmpHome = null;
}

function runAnalyze() {
  const r = spawnSync(process.execPath, [installerPath, "analyze", "--format=json"], {
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("ruleUsageModeDrift (G7 fix) — config.updatedAt filter", () => {
  beforeEach(async () => { tmpHome = null; });
  afterEach: ;
  // mode=none with ONLY historical entries (all before config.updatedAt) → NO drift candidate
  test("mode=none + only pre-updatedAt entries → drift NOT fired (G7 fix)", async () => {
    const updatedAt = new Date().toISOString();
    // entries are 2 days OLD relative to updatedAt
    const oldTs = new Date(Date.now() - 2 * 86400_000).toISOString();
    await setup({
      mode: "none",
      configUpdatedAt: updatedAt,
      entries: [
        { ts: oldTs, tool: "mcp__codex__codex", skill: "codex-review", outcome: "ok" },
        { ts: oldTs, tool: "mcp__codex__codex-reply", skill: "codex-followup", outcome: "ok" },
      ],
    });
    const r = runAnalyze();
    assert.equal(r.code, 0, `analyze failed: ${r.stderr}`);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id === "usage-mode-drift-none");
    assert.equal(drift, undefined, "drift candidate should NOT appear for pre-updatedAt entries");
    await teardown();
  });

  // mode=none with POST-updatedAt entries → drift IS fired
  test("mode=none + post-updatedAt entries → drift fired", async () => {
    const updatedAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const recentTs = new Date().toISOString();
    await setup({
      mode: "none",
      configUpdatedAt: updatedAt,
      entries: [{ ts: recentTs, tool: "mcp__codex__codex", skill: "codex-review", outcome: "ok" }],
    });
    const r = runAnalyze();
    assert.equal(r.code, 0, `analyze failed: ${r.stderr}`);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id === "usage-mode-drift-none");
    assert.notEqual(drift, undefined, "drift candidate SHOULD appear for post-updatedAt entries");
    await teardown();
  });

  // mode=synergy → no drift regardless of entries
  test("mode=synergy never produces drift", async () => {
    await setup({
      mode: "synergy",
      configUpdatedAt: new Date().toISOString(),
      entries: [{ ts: new Date().toISOString(), tool: "mcp__codex__codex", outcome: "ok" }],
    });
    const r = runAnalyze();
    assert.equal(r.code, 0);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id?.startsWith("usage-mode-drift"));
    assert.equal(drift, undefined);
    await teardown();
  });

  // mode=max with NO entries since updatedAt → idle drift fired
  test("mode=max + zero recent entries → max-idle drift fired", async () => {
    const updatedAt = new Date().toISOString();
    await setup({ mode: "max", configUpdatedAt: updatedAt, entries: [] });
    const r = runAnalyze();
    assert.equal(r.code, 0);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id === "usage-mode-drift-max-idle");
    assert.notEqual(drift, undefined, "max-idle drift should fire on empty window post-updatedAt");
    await teardown();
  });

  // mode=max with only PRE-updatedAt entries → max-idle drift STILL fired (because post-window is empty)
  test("mode=max + only pre-updatedAt entries → max-idle drift fired (post-window empty)", async () => {
    const updatedAt = new Date().toISOString();
    const oldTs = new Date(Date.now() - 86400_000).toISOString();
    await setup({
      mode: "max",
      configUpdatedAt: updatedAt,
      entries: [{ ts: oldTs, tool: "mcp__codex__codex", outcome: "ok" }],
    });
    const r = runAnalyze();
    assert.equal(r.code, 0);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id === "usage-mode-drift-max-idle");
    assert.notEqual(drift, undefined);
    await teardown();
  });

  // Edge: malformed entry.ts → entry is excluded from in-scope set
  test("entries with malformed ts are excluded (treated as before updatedAt)", async () => {
    const updatedAt = new Date().toISOString();
    await setup({
      mode: "none",
      configUpdatedAt: updatedAt,
      entries: [
        { ts: "not-a-date", tool: "mcp__codex__codex", outcome: "ok" },
      ],
    });
    const r = runAnalyze();
    assert.equal(r.code, 0);
    const report = JSON.parse(r.stdout);
    const drift = (report.candidates || []).find((c) => c.id === "usage-mode-drift-none");
    assert.equal(drift, undefined, "malformed timestamp must not fire drift");
    await teardown();
  });
});
