// A2 fix verification — install must copy detect-signals.mjs + auto-probe.mjs into
// ~/.claude/codex-on-claude/install/ so SKILL.md prose paths resolve.
//
// Run via:
//   node --test install/fixtures/v05/integration/install-copies-helpers.test.mjs

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const installerPath = path.join(repoRoot, "install/install.mjs");

let tmpHome;

before(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "coc-a2-"));
});

after(async () => {
  if (tmpHome && (tmpHome.startsWith("/tmp/") || tmpHome.startsWith("/var/folders/"))) {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
});

describe("A2 — helper modules copied to ~/.claude/codex-on-claude/install/", () => {
  test("Fresh install creates helpers at the well-known path", async () => {
    const r = spawnSync(process.execPath, [
      installerPath,
      "--usage-mode=synergy",
      "--patterns=review",
      "--context-policy=mixed",
      "--improvement-loop=manual",
      "--threads=basic",
      "--subscription-claude=max",
      "--subscription-codex=pro",
      "--yes",
    ], { encoding: "utf8", env: { ...process.env, HOME: tmpHome } });
    assert.equal(r.status, 0, `installer exit non-zero: ${r.stderr}`);

    const installDir = path.join(tmpHome, ".claude", "codex-on-claude", "install");
    const ds = path.join(installDir, "detect-signals.mjs");
    const ap = path.join(installDir, "auto-probe.mjs");
    await fs.access(ds);
    await fs.access(ap);
  });

  test("Copied detect-signals.mjs is executable (Node import succeeds)", async () => {
    // Spawn a child Node that imports the copied module and checks it exports detectSignals.
    const ds = path.join(tmpHome, ".claude", "codex-on-claude", "install", "detect-signals.mjs");
    const r = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import('${ds}').then(m => { if (typeof m.detectSignals !== 'function') process.exit(2); }).catch(() => process.exit(3))`,
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, `dynamic import failed: ${r.stderr}`);
  });

  test("Copied auto-probe.mjs is executable + exports mergeClassification", async () => {
    const ap = path.join(tmpHome, ".claude", "codex-on-claude", "install", "auto-probe.mjs");
    const r = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import('${ap}').then(m => { if (typeof m.mergeClassification !== 'function') process.exit(2); }).catch(() => process.exit(3))`,
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, `dynamic import failed: ${r.stderr}`);
  });

  test("state.installed.helpers tracks copied module names", async () => {
    const cfg = JSON.parse(await fs.readFile(
      path.join(tmpHome, ".claude", "codex-on-claude", "config.json"), "utf8"));
    const helpers = cfg?.installed?.helpers || [];
    assert.ok(helpers.includes("detect-signals.mjs"), "detect-signals.mjs in installed.helpers");
    assert.ok(helpers.includes("auto-probe.mjs"), "auto-probe.mjs in installed.helpers");
  });
});
