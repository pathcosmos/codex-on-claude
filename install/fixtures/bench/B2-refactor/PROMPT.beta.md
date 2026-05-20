In the current directory there are 4 files: `a.js`, `b.js`, `c.js`, `userlib.js`. The function `getUser` is exported from `userlib.js` and imported in the other three.

Use `/codex-fix` (file allowlist = all four files) to rename `getUser` → `loadUser` consistently. Update both the export and every import/call site. Touch no other file.

When done, reply with the single line `DONE` and stop.
