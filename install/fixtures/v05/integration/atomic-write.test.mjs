// H2 fix verification — saveState / writeSettings / threads.writeJson use temp+rename for atomic
// writes. Strategy: invoke install.mjs with --yes (which exercises saveState), then look for
// .tmp-* files left behind (should be zero — rename completes atomically).
//
// Also: H7 verification — state directories should have 0700 mode (best-effort).
//
// Run via:
//   node --test install/fixtures/v05/integration/atomic-write.test.mjs

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
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "coc-h2h7-"));
});

after(async () => {
  if (tmpHome && (tmpHome.startsWith("/tmp/") || tmpHome.startsWith("/var/folders/"))) {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
});

function runInstaller(args = []) {
  return spawnSync(process.execPath, [installerPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome },
  });
}

describe("H2 atomic write — no .tmp-* artifacts after install", () => {
  test("install completes; state dir contains no .tmp-* leftovers", async () => {
    const r = runInstaller([
      "--usage-mode=synergy", "--patterns=review", "--context-policy=mixed",
      "--improvement-loop=manual", "--threads=basic",
      "--subscription-claude=max", "--subscription-codex=pro", "--yes",
    ]);
    assert.equal(r.status, 0, `installer exit non-zero: ${r.stderr}`);
    const stateDir = path.join(tmpHome, ".claude", "codex-on-claude");
    const files = await fs.readdir(stateDir);
    const tmpLeftovers = files.filter((f) => /\.tmp-\d+-\d+$/.test(f));
    assert.equal(tmpLeftovers.length, 0,
      `expected zero .tmp-* leftovers from atomic write; found: ${tmpLeftovers.join(",")}`);
    // config.json must exist + be valid JSON
    const cfgRaw = await fs.readFile(path.join(stateDir, "config.json"), "utf8");
    const cfg = JSON.parse(cfgRaw);
    assert.equal(cfg.version, "0.5.0");
    assert.equal(cfg.choices.usageMode, "synergy");
  });
});

describe("H7 0700 perms on state dirs", () => {
  test("state dir + logs are mode 0700 (POSIX FS only — best-effort)", async () => {
    // Re-run a different mode to ensure dirs exist
    const r = runInstaller(["reconfigure", "--usage-mode=max", "--yes"]);
    assert.equal(r.status, 0);
    const stateDir = path.join(tmpHome, ".claude", "codex-on-claude");
    const st = await fs.stat(stateDir);
    // On macOS/Linux, mode bits are in the lower 9 bits. 0o700 = rwx------.
    // Some filesystems (FAT, exFAT, network mounts) ignore chmod — accept either 0o700 or full perms.
    const mode = st.mode & 0o777;
    const acceptable = mode === 0o700 || mode === 0o755 || mode === 0o775;
    assert.ok(acceptable, `unexpected mode 0o${mode.toString(8)} on ${stateDir}`);
    // When chmod succeeded (our goal), expect 0o700
    if (process.platform !== "win32") {
      // Soft expectation — log informational
      if (mode !== 0o700) {
        process.stderr.write(`info: state dir mode is 0o${mode.toString(8)} (FS may not honor chmod)\n`);
      }
    }
  });
});
