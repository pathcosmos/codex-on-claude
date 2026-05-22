#!/usr/bin/env node
// v0.5.0 L1 — runs all unit tests via `node --test`. Exits non-zero on any failure.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => path.join(here, f))
  .sort();

const r = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(r.status ?? 1);
