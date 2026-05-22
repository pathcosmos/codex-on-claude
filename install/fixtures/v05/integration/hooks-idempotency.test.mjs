// v0.5.0 integration test: hooks.mjs idempotency + marker isolation.
//
// hooks.mjs reads HOME at module load (`const HOME = os.homedir()`), so we
// cannot meaningfully override it from inside a single process without
// fighting the module cache. Instead we spawn one child `node` per scenario
// with HOME pointing at a fresh tmpdir. Each child imports hooks.mjs, runs
// the scenario, and exits. The parent then reads $HOME/.claude/settings.json
// and asserts on its shape.
//
// We intentionally use absolute paths in the child snippet so the working
// directory doesn't matter.

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOOKS_MJS = path.resolve(__dirname, "../../../hooks.mjs");
// Markers must match hooks.mjs exports — keep these in sync.
const MARKER = "codex-on-claude:auto-log";
const GATE_MARKER = "codex-on-claude:usage-gate";

async function makeTmpHome() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "coc-hooks-"));
  return dir;
}

async function readSettings(home) {
  const file = path.join(home, ".claude", "settings.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function seedSettings(home, data) {
  const dir = path.join(home, ".claude");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "settings.json"), JSON.stringify(data, null, 2) + "\n");
}

// Run a snippet of JS in a child node process with HOME pointing at `home`.
// The snippet has access to a pre-imported `hooks` module via top-level
// `await import(...)`. Stdout/stderr from the child are surfaced on failure.
function runInChild(home, snippet) {
  const code = `
    (async () => {
      const hooks = await import(${JSON.stringify(HOOKS_MJS)});
      ${snippet}
    })().catch((e) => { console.error(e?.stack || e); process.exit(1); });
  `;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `child exited with status=${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
  }
  return res;
}

function countGroupsByMarker(groups, marker) {
  if (!Array.isArray(groups)) return 0;
  return groups.filter(
    (g) => Array.isArray(g?.hooks) && g.hooks.some((h) => h?._coc?.marker === marker),
  ).length;
}

function commandsForMarker(groups, marker) {
  const out = [];
  for (const g of groups || []) {
    if (!Array.isArray(g?.hooks)) continue;
    for (const h of g.hooks) {
      if (h?._coc?.marker === marker) out.push(h.command);
    }
  }
  return out;
}

test("install() is idempotent — second call replaces the first, no duplicates", async () => {
  const home = await makeTmpHome();
  runInChild(home, `await hooks.install({ command: 'x' });`);
  runInChild(home, `await hooks.install({ command: 'y' });`);
  const settings = await readSettings(home);
  const post = settings?.hooks?.PostToolUse || [];
  assert.equal(countGroupsByMarker(post, MARKER), 2, "expected exactly 2 PostToolUse groups (one per matcher)");
  const cmds = commandsForMarker(post, MARKER);
  assert.deepEqual([...new Set(cmds)], ["y"], `latest install should win — got commands: ${cmds.join(", ")}`);
  // matchers are the two codex MCP tool names
  const matchers = post.map((g) => g.matcher).sort();
  assert.deepEqual(matchers, ["mcp__codex__codex", "mcp__codex__codex-reply"]);
});

test("installGate() is idempotent — second call replaces the first, no duplicates", async () => {
  const home = await makeTmpHome();
  runInChild(home, `await hooks.installGate({ command: 'g1' });`);
  runInChild(home, `await hooks.installGate({ command: 'g2' });`);
  const settings = await readSettings(home);
  const pre = settings?.hooks?.PreToolUse || [];
  assert.equal(countGroupsByMarker(pre, GATE_MARKER), 2, "expected exactly 2 PreToolUse gate groups");
  const cmds = commandsForMarker(pre, GATE_MARKER);
  assert.deepEqual([...new Set(cmds)], ["g2"], `latest installGate should win — got: ${cmds.join(", ")}`);
});

test("install() then remove() preserves a pre-existing user hook", async () => {
  const home = await makeTmpHome();
  // pre-seed a user-owned PostToolUse hook (no _coc marker)
  await seedSettings(home, {
    hooks: {
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "user-script.sh" }],
        },
      ],
    },
  });
  runInChild(home, `await hooks.install({ command: 'ours' });`);
  let s = await readSettings(home);
  // user hook still present alongside our 2 groups
  const allCommands = (s?.hooks?.PostToolUse || [])
    .flatMap((g) => g.hooks || [])
    .map((h) => h.command);
  assert.ok(allCommands.includes("user-script.sh"), "user hook lost after install");
  assert.ok(allCommands.includes("ours"), "our hook missing after install");

  runInChild(home, `await hooks.remove();`);
  s = await readSettings(home);
  const finalCommands = (s?.hooks?.PostToolUse || [])
    .flatMap((g) => g.hooks || [])
    .map((h) => h.command);
  assert.ok(finalCommands.includes("user-script.sh"), "user hook lost after remove");
  assert.ok(!finalCommands.includes("ours"), "our hook still present after remove");
});

test("install() + installGate() coexist with distinct markers on the same settings file", async () => {
  const home = await makeTmpHome();
  runInChild(home, `await hooks.install({ command: 'log-cmd' });`);
  runInChild(home, `await hooks.installGate({ command: 'gate-cmd' });`);
  const s = await readSettings(home);
  const post = s?.hooks?.PostToolUse || [];
  const pre = s?.hooks?.PreToolUse || [];
  assert.equal(countGroupsByMarker(post, MARKER), 2, "post-tool-use groups missing");
  assert.equal(countGroupsByMarker(pre, GATE_MARKER), 2, "pre-tool-use gate groups missing");
  // assert markers are actually different on the wire
  assert.notEqual(MARKER, GATE_MARKER);
  assert.deepEqual([...new Set(commandsForMarker(post, MARKER))], ["log-cmd"]);
  assert.deepEqual([...new Set(commandsForMarker(pre, GATE_MARKER))], ["gate-cmd"]);
});

test("remove() strips only MARKER and leaves GATE_MARKER groups untouched", async () => {
  const home = await makeTmpHome();
  runInChild(home, `await hooks.install({ command: 'log-cmd' });`);
  runInChild(home, `await hooks.installGate({ command: 'gate-cmd' });`);
  runInChild(home, `await hooks.remove();`);
  const s = await readSettings(home);
  const post = s?.hooks?.PostToolUse || [];
  const pre = s?.hooks?.PreToolUse || [];
  assert.equal(countGroupsByMarker(post, MARKER), 0, "post-tool-use groups not stripped");
  assert.equal(countGroupsByMarker(pre, GATE_MARKER), 2, "gate groups should NOT be touched by remove()");
});

test("removeGate() strips only GATE_MARKER and leaves MARKER groups untouched", async () => {
  const home = await makeTmpHome();
  runInChild(home, `await hooks.install({ command: 'log-cmd' });`);
  runInChild(home, `await hooks.installGate({ command: 'gate-cmd' });`);
  runInChild(home, `await hooks.removeGate();`);
  const s = await readSettings(home);
  const post = s?.hooks?.PostToolUse || [];
  const pre = s?.hooks?.PreToolUse || [];
  assert.equal(countGroupsByMarker(pre, GATE_MARKER), 0, "gate groups not stripped by removeGate()");
  assert.equal(countGroupsByMarker(post, MARKER), 2, "auto-log groups should NOT be touched by removeGate()");
});
