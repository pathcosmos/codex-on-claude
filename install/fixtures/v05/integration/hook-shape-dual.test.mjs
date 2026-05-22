// H1 fix verification — cmdGate must emit BOTH the legacy `{decision, reason}` shape AND
// the new `hookSpecificOutput.permissionDecision` shape so the gate works across Claude Code
// versions. Also verifies the hard-deny backstop (stderr + exit 2) for Codex-shaped tools.
//
// Run via:
//   node --test install/fixtures/v05/integration/hook-shape-dual.test.mjs

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
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "coc-h1-"));
  await fs.mkdir(path.join(tmpHome, ".claude", "codex-on-claude"), { recursive: true });
  await fs.writeFile(
    path.join(tmpHome, ".claude", "codex-on-claude", "config.json"),
    JSON.stringify({ choices: { usageMode: "none" } })
  );
});

after(async () => {
  if (tmpHome && (tmpHome.startsWith("/tmp/") || tmpHome.startsWith("/var/folders/"))) {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
});

function callGate(stdinPayload, extraArgs = []) {
  return spawnSync(process.execPath, [installerPath, "gate", "--from-stdin", ...extraArgs], {
    input: stdinPayload,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome },
  });
}

describe("cmdGate dual decision shape (H1 fix)", () => {
  test("Codex MCP × mode=none → output contains BOTH legacy + hookSpecificOutput shapes", () => {
    const r = callGate(JSON.stringify({ tool_name: "mcp__codex__codex" }));
    const out = JSON.parse(r.stdout.trim());

    // Legacy shape
    assert.equal(out.decision, "deny");
    assert.ok(typeof out.reason === "string" && out.reason.length > 0);

    // New shape
    assert.ok(out.hookSpecificOutput, "hookSpecificOutput field must be present");
    assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.ok(typeof out.hookSpecificOutput.permissionDecisionReason === "string");
    assert.equal(out.hookSpecificOutput.permissionDecisionReason, out.reason);
  });

  test("Hard-deny (Codex-shaped) → exit code 2 + stderr backstop", () => {
    const r = callGate(JSON.stringify({ tool_name: "mcp__codex__codex" }));
    // B3: exit 0 (Claude Code hook contract); stderr backstop still fires for hard-denies.
    assert.equal(r.status, 0, "exit 0 per Claude Code hook contract");
    assert.match(r.stderr, /\[codex-on-claude gate\] DENY:/, "stderr backstop fires");
  });

  test("Bash codex-CLI × mode=none → dual shape emitted", () => {
    const r = callGate(JSON.stringify({ tool_name: "Bash", tool_input: { command: "codex exec --json 'x'" } }));
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.decision, "deny");
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(r.status, 0); // B3: exit 0 per Claude Code hook contract
  });
});

describe("cmdGate --enforce-mode flag (H2 race-free path)", () => {
  test("--enforce-mode=none denies Codex MCP without reading config.json", async () => {
    // Even if config says synergy, the flag forces deny.
    await fs.writeFile(
      path.join(tmpHome, ".claude", "codex-on-claude", "config.json"),
      JSON.stringify({ choices: { usageMode: "synergy" } })
    );
    const r = callGate(JSON.stringify({ tool_name: "mcp__codex__codex" }), ["--enforce-mode=none"]);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.decision, "deny");
    assert.equal(r.status, 0); // B3: exit 0 per hook contract
    // Restore for other tests
    await fs.writeFile(
      path.join(tmpHome, ".claude", "codex-on-claude", "config.json"),
      JSON.stringify({ choices: { usageMode: "none" } })
    );
  });

  test("--enforce-mode=synergy allows Codex MCP even if config says none", async () => {
    // Inverse: flag wins over config.
    await fs.writeFile(
      path.join(tmpHome, ".claude", "codex-on-claude", "config.json"),
      JSON.stringify({ choices: { usageMode: "none" } })
    );
    const r = callGate(JSON.stringify({ tool_name: "mcp__codex__codex" }), ["--enforce-mode=synergy"]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  });

  test("Without --enforce-mode, config.json is read (back-compat)", () => {
    const r = callGate(JSON.stringify({ tool_name: "mcp__codex__codex" }));
    // Config has mode=none from before
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.decision, "deny");
  });
});
