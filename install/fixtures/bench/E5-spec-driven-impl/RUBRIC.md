# E5 — spec-driven-impl rubric

## Tricky spec items

- **Quoted fields containing commas**: naive split fails.
- **Escaped quotes (`""`)**: must collapse to single `"`.
- **Numeric coercion**: only matching `/^-?\d+(\.\d+)?$/` — strings like `"01"` stay strings.
- **skipEmpty default true**: row `,,` should be dropped.

α likely passes basic cases but stumbles on quoted-comma + escaped-quote unless careful. β's pre-impl review flags these as gotchas.
