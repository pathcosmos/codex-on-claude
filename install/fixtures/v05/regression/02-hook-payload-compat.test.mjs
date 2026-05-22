// L5.3 — Hook payload compatibility regression for extractFromHookPayload.
//
// The v0.3.4 release fixed two real-world Claude Code hook payload quirks:
//   1. tool_response can arrive as a JSON-encoded string (not a parsed object).
//   2. duration_ms is the canonical key; durationMs is a fallback alias.
//   3. Missing duration_ms must not crash — it should produce elapsedMs=0.
// The v0.5.0 refactor must keep these regressions fixed.
//
// We test the function indirectly through the public CLI surface:
//
//   echo '<payload-json>' | node install.mjs log --from-stdin
//
// Each test:
//   - sets HOME to a fresh temp dir
//   - writes a config.json with improvementLoop=auto-on-skill so
//     shouldAcceptAutoHookLog() returns true
//   - pipes a synthetic PostToolUse payload to install.mjs
//   - reads back ~/.claude/codex-on-claude/logs/usage-YYYY-MM-DD.jsonl
//   - asserts the extracted fields match expectations
//
// We deliberately do NOT modify install.mjs to export extractFromHookPayload —
// the CLI is the contract that Claude Code actually invokes, so testing
// through it gives a higher-fidelity guarantee.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// install.mjs is at <repo>/install/install.mjs; this test sits at
// <repo>/install/fixtures/v05/regression/02-hook-payload-compat.test.mjs.
const INSTALL_MJS = path.resolve(__dirname, "..", "..", "..", "install.mjs");
if (!existsSync(INSTALL_MJS)) {
  throw new Error(`install.mjs not found at expected path: ${INSTALL_MJS}`);
}

function makeIsolatedHome({ improvementLoop = "auto-on-skill" } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "coc-hookpayload-"));
  const cfgDir = path.join(home, ".claude", "codex-on-claude");
  mkdirSync(cfgDir, { recursive: true });
  const config = {
    version: "0.5.0",
    choices: {
      patterns: ["review"],
      contextPolicy: "mixed",
      improvementLoop,
      threads: "basic",
      usageMode: "synergy",
      autoTier2LLMProbe: true,
    },
    installed: { skills: ["codex-review"], hooks: true },
  };
  writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify(config, null, 2));
  return home;
}

function runLogFromStdin(home, payload) {
  const stdinStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync("node", [INSTALL_MJS, "log", "--from-stdin"], {
    input: stdinStr,
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
    encoding: "utf8",
  });
  return r;
}

function readJsonlEntries(home) {
  const dir = path.join(home, ".claude", "codex-on-claude", "logs");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const lines = readFileSync(path.join(dir, name), "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    for (const line of lines) out.push(JSON.parse(line));
  }
  return out;
}

function cleanup(home) {
  // Belt-and-suspenders: only nuke directories that look like our temp dirs.
  if (!home || !home.includes("coc-hookpayload-")) return;
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {}
}

// ----------------------------------------------------------------------------

test("tool_response as JSON-encoded string → threadId extracted (v0.3.4 regression)", () => {
  const home = makeIsolatedHome();
  try {
    const innerResponse = {
      threadId: "019e1234-5678-7000-8000-aaaabbbbcccc",
      content: "Codex review complete.",
    };
    const payload = {
      session_id: "test-session-1",
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "Review this PR.", sandbox: "read-only" },
      tool_response: JSON.stringify(innerResponse), // ← the v0.3.4 regression shape
      duration_ms: 1234,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1, `expected 1 log row, got ${entries.length}`);
    const row = entries[0];
    assert.equal(row.threadId, "019e1234-5678-7000-8000-aaaabbbbcccc",
      "threadId must be extracted from JSON-encoded tool_response string");
    assert.equal(row.tool, "mcp__codex__codex");
    assert.equal(row.elapsedMs, 1234, "elapsedMs taken from duration_ms");
  } finally {
    cleanup(home);
  }
});

test("tool_response as parsed object → threadId extracted", () => {
  const home = makeIsolatedHome();
  try {
    const payload = {
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "Hello." },
      tool_response: {
        threadId: "019e9999-aaaa-7000-8000-1111deadbeef",
        content: "Hello back.",
      },
      duration_ms: 500,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].threadId, "019e9999-aaaa-7000-8000-1111deadbeef",
      "threadId must be extracted from parsed object tool_response");
    assert.equal(entries[0].elapsedMs, 500);
  } finally {
    cleanup(home);
  }
});

test("duration_ms populated → elapsedMs > 0", () => {
  const home = makeIsolatedHome();
  try {
    const payload = {
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "x" },
      tool_response: { content: "y" },
      duration_ms: 42,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].elapsedMs, 42);
  } finally {
    cleanup(home);
  }
});

test("missing duration_ms → elapsedMs = 0 (no crash)", () => {
  const home = makeIsolatedHome();
  try {
    const payload = {
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "x" },
      tool_response: { content: "y" },
      // duration_ms intentionally omitted
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1, "row written even with missing duration_ms");
    assert.equal(entries[0].elapsedMs, 0,
      "missing duration_ms must coerce to 0, not NaN or null");
  } finally {
    cleanup(home);
  }
});

test("non-codex tool_name → log entry filtered (no JSONL row written)", () => {
  const home = makeIsolatedHome();
  try {
    const payload = {
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { content: "file1\nfile2" },
      duration_ms: 10,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 0,
      "non-codex tool name must be filtered — guard at install.mjs:1106");
  } finally {
    cleanup(home);
  }
});

// G3 fix: every log entry should carry the active usageMode so ruleUsageModeDrift
// can correlate calls to the mode that was in effect at log time.
test("G3: log entry carries usageMode from config (synergy default)", () => {
  const home = makeIsolatedHome();
  try {
    const payload = {
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "review" },
      tool_response: { threadId: "019e0000-1111-7000-8000-aaaaaaaaaaaa", content: "ok" },
      duration_ms: 100,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0, `exit non-zero: stderr=${r.stderr}`);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].usageMode, "synergy",
      "G3: entry must carry usageMode='synergy' from config.json");
  } finally {
    cleanup(home);
  }
});

test("G3: log entry usageMode reflects max mode after reconfigure", () => {
  // Set up a config with usageMode=max and confirm the log entry reflects that.
  const home = mkdtempSync(path.join(tmpdir(), "coc-hookpayload-"));
  const cfgDir = path.join(home, ".claude", "codex-on-claude");
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({
    version: "0.5.0",
    choices: { improvementLoop: "auto-on-skill", usageMode: "max", autoTier2LLMProbe: true },
    installed: { skills: ["codex-review"], hooks: true },
  }));
  try {
    const payload = {
      tool_name: "mcp__codex__codex",
      tool_input: { prompt: "x" },
      tool_response: { content: "y" },
      duration_ms: 1,
    };
    const r = runLogFromStdin(home, payload);
    assert.equal(r.status, 0);
    const entries = readJsonlEntries(home);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].usageMode, "max", "G3: entry must reflect mode=max");
  } finally {
    cleanup(home);
  }
});
