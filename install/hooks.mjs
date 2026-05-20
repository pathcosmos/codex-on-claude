// Merge/remove PostToolUse hooks in ~/.claude/settings.json so that
// Codex MCP tool calls get logged automatically by codex-on-claude.
//
// Every hook entry we install carries a unique marker so we can identify
// and remove only our own entries without touching user-defined hooks.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const SETTINGS_FILE = path.join(HOME, ".claude", "settings.json");

export const MARKER = "codex-on-claude:auto-log";

function nowIso() { return new Date().toISOString(); }

async function pathExists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function readSettings() {
  if (!(await pathExists(SETTINGS_FILE))) return {};
  try { return JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8")); } catch { return {}; }
}

async function writeSettings(data) {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2) + "\n");
}

function makeHookGroup(matcher, command) {
  return {
    matcher,
    hooks: [
      {
        type: "command",
        command,
        _coc: { marker: MARKER, installedAt: nowIso() },
      },
    ],
  };
}

function isOursGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((h) => h?._coc?.marker === MARKER);
}

export async function install({ command }) {
  if (!command) throw new Error("install({command}) requires a non-empty command");
  const settings = await readSettings();
  settings.hooks = settings.hooks || {};
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];

  // Strip any prior coc groups so we don't accumulate duplicates
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((g) => !isOursGroup(g));

  settings.hooks.PostToolUse.push(makeHookGroup("mcp__codex__codex", command));
  settings.hooks.PostToolUse.push(makeHookGroup("mcp__codex__codex-reply", command));

  await writeSettings(settings);
  return { settingsFile: SETTINGS_FILE, addedGroups: 2 };
}

export async function remove() {
  if (!(await pathExists(SETTINGS_FILE))) return { removedGroups: 0 };
  const settings = await readSettings();
  const before = settings?.hooks?.PostToolUse?.length || 0;
  if (Array.isArray(settings?.hooks?.PostToolUse)) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((g) => !isOursGroup(g));
    if (!settings.hooks.PostToolUse.length) delete settings.hooks.PostToolUse;
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  }
  await writeSettings(settings);
  const after = settings?.hooks?.PostToolUse?.length || 0;
  return { removedGroups: before - after };
}

export async function status() {
  const settings = await readSettings();
  const groups = (settings?.hooks?.PostToolUse || []).filter(isOursGroup);
  return {
    settingsFile: SETTINGS_FILE,
    present: groups.length,
    matchers: groups.map((g) => g.matcher),
  };
}
