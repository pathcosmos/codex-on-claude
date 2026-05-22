// Merge/remove PostToolUse + PreToolUse hooks in ~/.claude/settings.json so that
// Codex MCP tool calls get logged (PostToolUse) and gated by usage mode (PreToolUse).
//
// Every hook entry we install carries a unique marker so we can identify
// and remove only our own entries without touching user-defined hooks.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const SETTINGS_FILE = path.join(HOME, ".claude", "settings.json");
const STATE_FILE = path.join(HOME, ".claude", "codex-on-claude", "config.json");

export const MARKER = "codex-on-claude:auto-log";
export const GATE_MARKER = "codex-on-claude:usage-gate";

function nowIso() { return new Date().toISOString(); }

async function pathExists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function readSettings() {
  // H2 fix (pre-ship): treating malformed settings.json as `{}` would let writeSettings()
  // CLOBBER the user's entire settings file when we install/remove hooks. Now throw so the
  // caller can back up + warn instead of silently wiping config.
  if (!(await pathExists(SETTINGS_FILE))) return {};
  const raw = await fs.readFile(SETTINGS_FILE, "utf8");
  if (!raw.trim()) return {}; // genuinely empty file is OK
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error(`~/.claude/settings.json is not valid JSON: ${e.message}`);
    err.code = "SETTINGS_MALFORMED";
    err.path = SETTINGS_FILE;
    throw err;
  }
}

// Helper for callers to back up a malformed settings.json before overwriting.
async function backupCorruptSettings() {
  if (!(await pathExists(SETTINGS_FILE))) return null;
  const stamp = nowIso().replace(/[:.]/g, "-");
  const dst = `${SETTINGS_FILE}.corrupt-${stamp}`;
  await fs.copyFile(SETTINGS_FILE, dst);
  return dst;
}

async function writeSettings(data) {
  // H2 fix: atomic write (temp + rename) so concurrent reads (e.g. the gate hook itself) never
  // see a partial settings.json. rename(2) is atomic on POSIX within the same filesystem.
  // A3 fix (final pre-ship): clean up temp on rename failure to avoid `*.tmp-PID-TS` leaks.
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  try {
    await fs.rename(tmp, SETTINGS_FILE);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

function makeHookGroup(matcher, command, marker = MARKER) {
  return {
    matcher,
    hooks: [
      {
        type: "command",
        command,
        _coc: { marker, installedAt: nowIso() },
      },
    ],
  };
}

function isOursGroup(group, marker = MARKER) {
  return Array.isArray(group?.hooks) && group.hooks.some((h) => h?._coc?.marker === marker);
}

function stripOursFromGroupsByMarker(groups, marker) {
  return groups
    .map((group) => {
      if (!Array.isArray(group?.hooks)) return group;
      const hooks = group.hooks.filter((h) => h?._coc?.marker !== marker);
      return hooks.length ? { ...group, hooks } : null;
    })
    .filter(Boolean);
}

export async function install({ command }) {
  if (!command) throw new Error("install({command}) requires a non-empty command");
  let settings;
  try {
    settings = await readSettings();
  } catch (e) {
    if (e?.code === "SETTINGS_MALFORMED") {
      // H2: don't clobber. Back up + start fresh (preserves the broken file for inspection).
      const backup = await backupCorruptSettings();
      const msg = backup
        ? `[codex-on-claude] settings.json was malformed; backed up to ${backup} before installing hooks.`
        : `[codex-on-claude] settings.json was malformed; could not back up.`;
      process.stderr.write(msg + "\n");
      settings = {};
    } else { throw e; }
  }
  settings.hooks = settings.hooks || {};
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];

  // Strip only our marked hook entries (hook-level filter — preserves user hooks
  // even when they coexist in the same group as one of ours).
  settings.hooks.PostToolUse = stripOursFromGroupsByMarker(settings.hooks.PostToolUse, MARKER);

  settings.hooks.PostToolUse.push(makeHookGroup("mcp__codex__codex", command));
  settings.hooks.PostToolUse.push(makeHookGroup("mcp__codex__codex-reply", command));

  await writeSettings(settings);
  return { settingsFile: SETTINGS_FILE, addedGroups: 2 };
}

export async function remove() {
  if (!(await pathExists(SETTINGS_FILE))) return { removedGroups: 0 };
  let settings;
  try { settings = await readSettings(); }
  catch (e) {
    if (e?.code === "SETTINGS_MALFORMED") {
      // H2: malformed — we cannot safely write back. Surface the situation; user must fix manually.
      process.stderr.write(`[codex-on-claude] settings.json malformed; cannot safely remove hooks. Fix the file manually or restore from backup.\n`);
      return { removedGroups: 0 };
    } else { throw e; }
  }
  const before = settings?.hooks?.PostToolUse?.length || 0;
  if (Array.isArray(settings?.hooks?.PostToolUse)) {
    settings.hooks.PostToolUse = stripOursFromGroupsByMarker(settings.hooks.PostToolUse, MARKER);
    if (!settings.hooks.PostToolUse.length) delete settings.hooks.PostToolUse;
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  }
  await writeSettings(settings);
  const after = settings?.hooks?.PostToolUse?.length || 0;
  return { removedGroups: before - after };
}

export async function status() {
  const settings = await readSettings();
  const groups = (settings?.hooks?.PostToolUse || []).filter((g) => isOursGroup(g, MARKER));
  return {
    settingsFile: SETTINGS_FILE,
    present: groups.length,
    matchers: groups.map((g) => g.matcher),
  };
}

// v0.5.0: PreToolUse gate — enforces usageMode=none by denying Codex MCP calls.
// L6.1/L6.2 findings:
//   - Originally registered only 2 exact matchers (`mcp__codex__codex` + `mcp__codex__codex-reply`).
//     Any future MCP tool name (e.g. `mcp__codex__codex_resume`) would bypass the gate.
//   - CLI bypass: `Bash` tool with command `codex exec ...` or `codex-on-claude threads resume`
//     directly spawns Codex without ever invoking an MCP tool. Gate was blind to this.
// Fix: register 3 matchers — regex `mcp__codex__.*` for any Codex MCP tool variant, plus a `Bash`
//   matcher that decideGate() inspects for codex-CLI invocations.
export async function installGate({ command }) {
  if (!command) throw new Error("installGate({command}) requires a non-empty command");
  let settings;
  try { settings = await readSettings(); }
  catch (e) {
    if (e?.code === "SETTINGS_MALFORMED") {
      const backup = await backupCorruptSettings();
      const msg = backup
        ? `[codex-on-claude] settings.json was malformed; backed up to ${backup} before installing gate.`
        : `[codex-on-claude] settings.json was malformed; could not back up before installing gate.`;
      process.stderr.write(msg + "\n");
      settings = {};
    } else { throw e; }
  }
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  settings.hooks.PreToolUse = stripOursFromGroupsByMarker(settings.hooks.PreToolUse, GATE_MARKER);
  // Wildcard matcher covers all current + future Codex MCP tool names.
  settings.hooks.PreToolUse.push(makeHookGroup("mcp__codex__.*", command, GATE_MARKER));
  // Bash matcher — decideGate inspects tool_input.command for codex-CLI invocations.
  settings.hooks.PreToolUse.push(makeHookGroup("Bash", command, GATE_MARKER));
  await writeSettings(settings);
  return { settingsFile: SETTINGS_FILE, addedGroups: 2 };
}

export async function removeGate() {
  if (!(await pathExists(SETTINGS_FILE))) return { removedGroups: 0 };
  let settings;
  try { settings = await readSettings(); }
  catch (e) {
    if (e?.code === "SETTINGS_MALFORMED") {
      process.stderr.write(`[codex-on-claude] settings.json malformed; cannot safely remove gate. Fix the file manually.\n`);
      return { removedGroups: 0 };
    } else { throw e; }
  }
  const before = (settings?.hooks?.PreToolUse || []).filter((g) => isOursGroup(g, GATE_MARKER)).length;
  if (Array.isArray(settings?.hooks?.PreToolUse)) {
    settings.hooks.PreToolUse = stripOursFromGroupsByMarker(settings.hooks.PreToolUse, GATE_MARKER);
    if (!settings.hooks.PreToolUse.length) delete settings.hooks.PreToolUse;
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  }
  await writeSettings(settings);
  return { removedGroups: before };
}

export async function gateStatus() {
  const settings = await readSettings();
  const groups = (settings?.hooks?.PreToolUse || []).filter((g) => isOursGroup(g, GATE_MARKER));
  return {
    settingsFile: SETTINGS_FILE,
    present: groups.length,
    matchers: groups.map((g) => g.matcher),
  };
}

// Pure decision function — exported for unit tests + the `gate` sub-command.
// Inputs:
//   payload: parsed PreToolUse hook payload (best-effort schema: { tool_name, tool_input, ... })
//   config:  parsed config.json (specifically choices.usageMode + choices.guardrails)
// Returns:
//   { decision: "allow" | "deny", reason: string, meta: object }
//
// L6.1/L6.2 fixes (v0.5.0):
//   - Widened MCP regex from `^mcp__codex__codex` to `^mcp__codex__` — covers any future
//     codex MCP tool variant (e.g. `codex_resume`, `codex_followup`).
//   - Case-insensitive: `toLowerCase()` before matching so `MCP__CODEX__CODEX` cannot slip through.
//   - Bash command inspection: when tool_name === "Bash", inspect tool_input.command for
//     codex-CLI invocations (`codex exec`, `codex-on-claude threads resume`, `npx codex`, etc.).
//   - Tool name still allow-listed (Bash with non-codex command → allow).
export function decideGate(payload, config) {
  const mode = config?.choices?.usageMode || "synergy";
  const rawToolName = payload?.tool_name || payload?.toolName || "";
  const toolName = String(rawToolName).toLowerCase();

  // 1) Codex MCP tool family (current + future variants)
  const isCodexMcp = /^mcp__codex__/.test(toolName);

  // 2) Bash invocation of Codex CLI (post-L6.2 fix + B4/H1 pre-ship hardening)
  //
  // B4 fix: original regex missed shell wrappers — `eval "codex exec ..."`, `sh -c "codex ..."`,
  // `bash -lc 'codex'`, backtick-quoted, env-prefixed, etc. all bypassed. We now also match the
  // `codex` token when it appears inside any common shell-wrapper command's argument.
  //
  // H1 fix: original regex over-matched `grep codex file` / `echo "var codex = 1"` (codex anywhere
  // in args). We now require `codex` to be a COMMAND token: command start, after `;` `&&` `||` `|`
  // `` ` ``, or inside a quoted argument to a shell-wrapper. NOT after an arbitrary command's args.
  let isCodexCli = false;
  let cliEvidence = null;
  if (toolName === "bash") {
    const cmd = String(payload?.tool_input?.command || payload?.toolInput?.command || "");

    // Patterns (any one matches → deny):
    //  P1 — codex as command first token (after BOL / ; / && / || / | / backtick / ( / `$(`)
    //  Use plain RegExp literal to avoid backtick-in-template clash.
    const codexAsCommand = /(?:^|[;&|`(]|&&|\|\||\$\()\s*(?:[A-Za-z0-9_/.~-]*\/)?codex(?:\s|$)/;

    //  P2 — npx (...) codex (with optional flags + version pin + scoped pkg)
    const npxCodex = /\bnpx\s+(?:--?\S+\s+)*(?:@[\w./-]+\/)?codex(?:@[\w.-]+)?\b/;

    //  P3 — `codex-on-claude threads resume` (the only sub-command that spawns Codex)
    const threadsResume = /\bcodex-on-claude\s+threads\s+resume\b/;

    //  P4 — shell wrappers: eval / sh / bash / zsh / env / exec followed by any
    //       content containing `codex` as a token (handles quoted args, -c forms, etc.).
    //       This intentionally over-matches inside a wrapper because the user explicitly
    //       passed a wrapper — they're proxying a command we can't safely parse.
    const shellWrapper = /\b(?:eval|sh|bash|zsh|ksh|fish|env|exec)\b[^|;&\n]{0,200}\b(?:[A-Za-z0-9_/.~-]*\/)?codex\b/;

    if (codexAsCommand.test(cmd) || npxCodex.test(cmd) || threadsResume.test(cmd) || shellWrapper.test(cmd)) {
      isCodexCli = true;
      cliEvidence = cmd.slice(0, 120);
    }
  }

  if (!isCodexMcp && !isCodexCli) {
    return { decision: "allow", reason: "non-codex tool", meta: { mode } };
  }

  if (mode === "none") {
    const reason = isCodexCli
      ? `Codex CLI invocations are disabled by usageMode=none (matched in Bash command). Run \`codex-on-claude reconfigure --usage-mode=synergy\` to enable.`
      : `Codex calls are disabled by usageMode=none. Run \`codex-on-claude reconfigure --usage-mode=synergy\` to enable.`;
    return {
      decision: "deny",
      reason,
      meta: { mode, marker: GATE_MARKER, source: isCodexCli ? "bash-cli" : "mcp", evidence: cliEvidence },
    };
  }
  return { decision: "allow", reason: `mode=${mode}`, meta: { mode, source: isCodexCli ? "bash-cli" : "mcp" } };
}

export async function readConfigSafe() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); } catch { return null; }
}
