// B4 + H1 fix verification — Bash gate must catch shell-wrapper bypasses (eval / sh -c /
// bash -lc / env / exec / ksh / fish) AND must NOT false-positive on `grep codex`, `echo codex`,
// `cat codex.md` (codex appearing in args, not as a command).
//
// Run via:
//   node --test install/fixtures/v05/unit/decide-gate-bash-wrappers.test.mjs

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { decideGate } from "../../../hooks.mjs";

const cfgNone = { choices: { usageMode: "none" } };
const cfgSyn = { choices: { usageMode: "synergy" } };

function bashPayload(command) {
  return { tool_name: "Bash", tool_input: { command } };
}

describe("B4 — Shell-wrapper bypass detection (mode=none deny)", () => {
  const denyCases = [
    `eval "codex exec --json 'hi'"`,
    `sh -c "codex exec"`,
    `bash -lc 'codex exec'`,
    `zsh -c "codex exec"`,
    `ksh -c "codex exec"`,
    `env CODEX_HOME=/tmp codex exec`,
    `env -i codex exec`,
    `exec codex exec`,
    // Backtick / subshell forms (already covered by codexAsCommand P1)
    "echo `codex exec`",
    "result=$(codex exec)",
    // Compound commands
    "false; codex exec",
    "true && codex exec",
    "false || codex exec",
    "ls | codex exec",
  ];
  for (const cmd of denyCases) {
    test(`deny: ${cmd}`, () => {
      const r = decideGate(bashPayload(cmd), cfgNone);
      assert.equal(r.decision, "deny", `expected deny for: ${cmd}`);
      assert.equal(r.meta.source, "bash-cli");
    });
  }
});

describe("H1 — False-positive elimination (codex as arg, not as command)", () => {
  const allowCases = [
    `grep codex README.md`,
    `echo "var codex = 1"`,
    `ls codex-on-claude/`,
    `cat codex.md`,
    `find . -name "*codex*"`,
    `printf "codex\\n"`,
    `awk '/codex/ {print}' file`,
    `git log --grep=codex`,
    `wc -l codex-output.json`,
    `cd codex-workspace`,
  ];
  for (const cmd of allowCases) {
    test(`allow: ${cmd}`, () => {
      const r = decideGate(bashPayload(cmd), cfgNone);
      assert.equal(r.decision, "allow", `expected allow for: ${cmd}`);
    });
  }
});

describe("Bash gate × synergy mode → allow (gate is only active under none)", () => {
  test(`synergy + 'codex exec' → allow`, () => {
    const r = decideGate(bashPayload("codex exec"), cfgSyn);
    assert.equal(r.decision, "allow");
  });
  test(`synergy + 'eval codex exec' → allow`, () => {
    const r = decideGate(bashPayload(`eval "codex exec"`), cfgSyn);
    assert.equal(r.decision, "allow");
  });
});

describe("Bash gate + missing command field → allow (defensive)", () => {
  test(`Bash with no tool_input.command → allow`, () => {
    const r = decideGate({ tool_name: "Bash" }, cfgNone);
    assert.equal(r.decision, "allow");
  });
  test(`Bash with empty command → allow`, () => {
    const r = decideGate({ tool_name: "Bash", tool_input: { command: "" } }, cfgNone);
    assert.equal(r.decision, "allow");
  });
});
