# Spec — `parseCsv(input, opts)` function

Implement a CSV parser in `parser.js` exporting `parseCsv(input: string, opts?: object): Array<object>`.

## Required behavior

1. **First line is header**: keys for each row come from the first non-empty line.
2. **Quoted fields**: support `"..."` quoting; a `""` inside quotes is an escaped quote.
3. **Trailing newlines**: ignored (no empty row at end).
4. **Empty input**: returns `[]`.
5. **opts.skipEmpty (default true)**: if true, skip rows where every cell is empty string.
6. **opts.trim (default false)**: if true, trim whitespace from each cell.
7. **Numeric coercion**: if a cell matches `/^-?\d+(\.\d+)?$/`, coerce to Number.

## Example

```js
parseCsv('name,age\nAlice,30\nBob,25')
// => [{name: 'Alice', age: 30}, {name: 'Bob', age: 25}]

parseCsv('a,b\n"hello, world","quoted ""inside"""')
// => [{a: 'hello, world', b: 'quoted "inside"'}]
```

## Test file

`parser.test.js` (provided) tests all 7 behaviors. Implementation must pass.
