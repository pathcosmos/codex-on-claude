# E9 — cross-file-dependency rubric

## Planted issues

- **Circular**: `core.js → utils.js → core.js` via `processItem` ↔ `transform`.
- **Missing imports**: `db.js` (referenced by api.js), `security.js` (referenced by middleware.js).

## Differential

α reads 8 files (~35KB) → big main context.
β delegates to subagent / Codex → smaller main context (`tr_p95 < 20KB`).

Quality should be equivalent (both should find the circular dep + 2 missing files).
