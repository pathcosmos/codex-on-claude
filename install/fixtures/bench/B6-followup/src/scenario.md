# B6 — 5-turn debugging scenario

Symptoms: a Node.js script `worker.js` is producing duplicate output for entries with even IDs only.

Source (`worker.js`):
```js
function handle(ids) {
  for (const id of ids) {
    console.log(`processing ${id}`);
    if (id % 2 === 0) console.log(`processing ${id}`);  // <-- duplicate line
  }
}
handle([1, 2, 3, 4, 5]);
```

Oracle root cause: line 4 has a stray duplicate `console.log`. The 5-turn dialog should arrive at "remove line 4" or "the `if (id % 2 === 0)` branch is unintended duplication."
