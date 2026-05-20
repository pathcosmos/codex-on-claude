In the current directory there is `calc.ts` exporting 12 pure functions. Write a single test file `calc.test.ts` that:

1. Covers at least 10 of the 12 functions.
2. Includes at least 3 edge-case tests (negative numbers, zero, empty array, overflow, etc.).
3. Uses plain `node:assert` + a runner function (no jest/vitest). The file must be runnable via `npx tsx calc.test.ts` or via a shim `run_tests.sh`.

Touch only `calc.test.ts`.

When done, reply with the single line `DONE` and stop.
