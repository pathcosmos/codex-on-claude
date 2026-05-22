// Tiny template renderer for install-time placeholder substitution.
//
// Replaces {{dot.path.keys}} occurrences inside .md / .json files under a
// directory tree using a values object. Unknown placeholders are left in
// place (intentional — surface drift instead of silently writing the literal
// string "undefined" into Skill prose).
//
// Public API:
//   renderTree(srcDir, dstDir, values)
//     Recursive copy src → dst, then walk text files in dst and substitute.
//   renderFile(srcPath, dstPath, values)
//     Same as renderTree but for a single file (used for the agent's flat .md).
//   substitute(text, values)
//     Pure helper exposed for tests.

import { promises as fs } from "node:fs";
import path from "node:path";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const TEXT_EXTS = new Set([".md", ".json", ".txt", ".jsonl", ".toml"]);

export function substitute(text, values) {
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const v = lookup(values, key);
    return v === undefined || v === null ? match : String(v);
  });
}

function lookup(obj, dottedPath) {
  if (!obj) return undefined;
  const parts = dottedPath.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

async function renderInPlace(filePath, values) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return false;
  let src;
  try { src = await fs.readFile(filePath, "utf8"); } catch { return false; }
  if (!PLACEHOLDER_RE.test(src)) return false;
  PLACEHOLDER_RE.lastIndex = 0; // reset stateful regex
  const out = substitute(src, values);
  if (out === src) return false;
  await fs.writeFile(filePath, out);
  return true;
}

async function* walkTextFiles(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkTextFiles(full);
    else if (e.isFile()) yield full;
  }
}

export async function copyTree(src, dst) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, { recursive: true, force: true });
}

export async function renderTree(srcDir, dstDir, values) {
  await copyTree(srcDir, dstDir);
  let count = 0;
  for await (const file of walkTextFiles(dstDir)) {
    if (await renderInPlace(file, values)) count++;
  }
  return { rendered: count };
}

export async function renderFile(srcPath, dstPath, values) {
  await fs.mkdir(path.dirname(dstPath), { recursive: true });
  await fs.copyFile(srcPath, dstPath);
  const did = await renderInPlace(dstPath, values);
  return { rendered: did ? 1 : 0 };
}
