#!/usr/bin/env node
// v0.5.0 integration runner.
//
// Runs the three integration test files sequentially via `node --test`,
// aggregates pass/fail counts from the TAP output, and exits non-zero if any
// scenario fails. Prints a final summary line:
//   INTEGRATION: PASS N / FAIL M

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-discover all *.test.mjs (alphabetical) so newly added files are picked up.
const TEST_FILES = readdirSync(__dirname).filter((f) => f.endsWith(".test.mjs")).sort();

let totalPass = 0;
let totalFail = 0;
let anyError = false;

for (const f of TEST_FILES) {
  const full = path.join(__dirname, f);
  process.stdout.write(`\n=== ${f} ===\n`);
  const res = spawnSync(process.execPath, ["--test", full], { encoding: "utf8" });
  process.stdout.write(res.stdout || "");
  if (res.stderr) process.stderr.write(res.stderr);

  // Parse TAP-ish output. node --test emits `# pass N` and `# fail N` lines.
  const passMatch = (res.stdout || "").match(/^# pass (\d+)/m);
  const failMatch = (res.stdout || "").match(/^# fail (\d+)/m);
  if (passMatch) totalPass += parseInt(passMatch[1], 10);
  if (failMatch) totalFail += parseInt(failMatch[1], 10);

  if (res.status !== 0) anyError = true;
}

const line = `INTEGRATION: PASS ${totalPass} / FAIL ${totalFail}`;
process.stdout.write(`\n${line}\n`);

if (anyError || totalFail > 0) process.exit(1);
process.exit(0);
