// Integration: boot the cerberus MCP server as a subprocess and drive its 5 tools over stdio
// JSON-RPC. Verifies init→consensus end-to-end including v0.5.2 nonce verification + the disk
// artifacts (plan.json, plans/*.json, consensus.json, events.jsonl). No `npm link` dependency —
// references the local install.mjs by absolute path so this test is CI-friendly.
// Run: node --test install/fixtures/v05/integration/cerberus-end-to-end.test.mjs

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const installerPath = path.resolve(here, "../../../install.mjs");

// Spawn one server, exchange messages, return parsed responses. Tolerates JSON-RPC stream framing.
function rpcSession(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installerPath, "mcp-server", "cerberus"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = [];
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        const i = buf.indexOf("\n");
        if (i < 0) break;
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { responses.push(JSON.parse(line)); } catch { /* ignore non-JSON banner lines */ }
      }
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("error", reject);
    child.on("close", () => resolve({ responses, stderr }));
    // Returns helpers for the caller to send messages.
    resolve._helpers = {
      send(msg) { child.stdin.write(JSON.stringify(msg) + "\n"); },
      end() { child.stdin.end(); },
      kill() { child.kill(); },
    };
    setImmediate(() => resolve.bound = true);
    resolve.helpers = resolve._helpers;
  });
}

// Simpler: send all messages, end stdin, collect everything.
function runRpc(messages, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installerPath, "mcp-server", "cerberus"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = [];
    let buf = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        const i = buf.indexOf("\n");
        if (i < 0) break;
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { responses.push(JSON.parse(line)); } catch { /* skip banner */ }
      }
    });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, responses }));
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
    child.stdin.end();
  });
}

let tmpHome;

describe("Cerberus MCP — end-to-end (v0.5.2)", () => {
  test("initialize + tools/list + init → 5 tools surfaced, run_id + nonces issued", async () => {
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "coc-e2e-"));
    try {
      const { responses, code, stderr } = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "init", arguments: { task: "e2e smoke", scope: "head" } } },
      ], { HOME: tmpHome });

      assert.equal(code, 0, `server exited non-zero: ${stderr}`);

      const initResp = responses.find((r) => r.id === 1);
      assert.ok(initResp?.result?.serverInfo?.name === "cerberus", "initialize must return server name=cerberus");

      const toolsList = responses.find((r) => r.id === 2);
      const toolNames = (toolsList?.result?.tools || []).map((t) => t.name).sort();
      assert.deepEqual(toolNames, ["consensus", "init", "inspect", "list", "status"], "must surface 5 tools");

      const initCall = responses.find((r) => r.id === 3);
      const initStructured = initCall?.result?.structuredContent;
      assert.ok(initStructured, "init must return structuredContent");
      assert.match(initStructured.run_id, /^\d{8}T\d+Z-[0-9a-f]{6}$/);
      assert.equal(initStructured.agents.length, 3);
      // v0.5.2: validation_nonces present + each is 6-hex
      assert.ok(initStructured.validation_nonces, "validation_nonces must be present (v0.5.2)");
      for (const head of ["h1", "h2", "h3"]) {
        assert.match(initStructured.validation_nonces[head], /^[0-9a-f]{6}$/, `${head} nonce must be 6-hex`);
      }
      assert.match(initStructured.nonce_instruction, /cerberus-nonce/);

      // Disk artifacts.
      const planJson = JSON.parse(await fs.readFile(path.join(tmpHome, ".claude", "codex-on-claude", "cerberus", "runs", initStructured.run_id, "plan.json"), "utf8"));
      assert.equal(planJson.phase, "awaiting_heads");
      assert.deepEqual(planJson.nonces, initStructured.validation_nonces, "plan.json must persist nonces from init");
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("consensus rejects when nonces are missing/wrong (v0.5.2 challenge)", async () => {
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "coc-e2e-"));
    try {
      // Step 1: init to get a run_id + nonces.
      const init = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "init", arguments: { task: "reject test", scope: "head" } } },
      ], { HOME: tmpHome });

      const initData = init.responses.find((r) => r.id === 2).result.structuredContent;
      const { run_id, validation_nonces } = initData;

      // Step 2: call consensus with WRONG nonces (h2 swapped to h3's nonce).
      const fakePlans = [
        { head: "h1", plan: `## Decision\nA\n\ncerberus-nonce: ${validation_nonces.h1}\n` },
        { head: "h2", plan: `## Decision\nA\n\ncerberus-nonce: ${validation_nonces.h3}\n` }, // WRONG
        { head: "h3", plan: `## Decision\nA\n\ncerberus-nonce: ${validation_nonces.h3}\n` },
      ];

      const reject = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "consensus", arguments: { run_id, plans: fakePlans } } },
      ], { HOME: tmpHome });

      const resp = reject.responses.find((r) => r.id === 2);
      const errorText = resp?.error?.message || resp?.result?.content?.[0]?.text || "";
      assert.match(errorText, /nonce verification failed/, `expected nonce reject; got: ${errorText}`);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("consensus succeeds with correct nonces + persists artifacts", async () => {
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "coc-e2e-"));
    try {
      const init = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "init", arguments: { task: "success test", scope: "head" } } },
      ], { HOME: tmpHome });

      const initData = init.responses.find((r) => r.id === 2).result.structuredContent;
      const { run_id, validation_nonces } = initData;

      const plans = [
        { head: "h1", plan: `## Decision\nA\n\n## Reasons\n- deterministic algorithm\n- zero extra LLM cost\n\ncerberus-nonce: ${validation_nonces.h1}\n` },
        { head: "h2", plan: `## Decision\nA\n\n## Reasons\n- deterministic implementation\n- safer for patch\n\ncerberus-nonce: ${validation_nonces.h2}\n` },
        { head: "h3", plan: `## Decision\nA\n\n## Reasons\n- deterministic and reproducible\n- preserves dissent\n\ncerberus-nonce: ${validation_nonces.h3}\n` },
      ];

      const result = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "consensus", arguments: { run_id, plans } } },
      ], { HOME: tmpHome });

      const resp = result.responses.find((r) => r.id === 2);
      const data = resp?.result?.structuredContent;
      assert.ok(data, `consensus must return structuredContent; got: ${JSON.stringify(resp)}`);
      assert.equal(data.run_id, run_id);
      assert.ok(data.consensus_plan.length > 0);
      assert.ok(typeof data.agreement_score === "number");
      assert.ok(data.label === "low" || data.label === "moderate" || data.label === "high");

      // Disk artifacts after consensus.
      const runDir = path.join(tmpHome, ".claude", "codex-on-claude", "cerberus", "runs", run_id);
      const consensusJson = JSON.parse(await fs.readFile(path.join(runDir, "consensus.json"), "utf8"));
      assert.equal(consensusJson.run_id, run_id);
      for (const h of ["h1", "h2", "h3"]) {
        const headPlan = JSON.parse(await fs.readFile(path.join(runDir, "plans", `${h}.json`), "utf8"));
        assert.equal(headPlan.head, h);
      }
      const events = (await fs.readFile(path.join(runDir, "events.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      assert.ok(events.some((e) => e.event === "init"));
      assert.ok(events.some((e) => e.event === "consensus"));
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("force: true bypasses nonce verification (test/admin path)", async () => {
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "coc-e2e-"));
    try {
      const init = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "init", arguments: { task: "force test", scope: "head" } } },
      ], { HOME: tmpHome });
      const { run_id } = init.responses.find((r) => r.id === 2).result.structuredContent;

      // Plans with NO nonce lines, but force: true.
      const plans = [
        { head: "h1", plan: "## Decision\nA\n" },
        { head: "h2", plan: "## Decision\nA\n" },
        { head: "h3", plan: "## Decision\nA\n" },
      ];

      const result = await runRpc([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "consensus", arguments: { run_id, plans, force: true } } },
      ], { HOME: tmpHome });

      const resp = result.responses.find((r) => r.id === 2);
      const data = resp?.result?.structuredContent;
      assert.ok(data?.consensus_plan, `force:true must bypass nonce check; got error: ${resp?.error?.message || resp?.result?.content?.[0]?.text}`);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
