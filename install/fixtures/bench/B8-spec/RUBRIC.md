# B8 — spec extraction rubric

| Criterion | Pass | Notes |
|---|---|---|
| `endpoints` ≥ stub count (currently 6) | mechanical | Catches truncation. Update to 38 when SPEC.md grows to 40. |
| `endpoints` ≤ stub count + 1 | mechanical | Catches hallucination of extra entries. |
| Text mentions `none` (auth value) | mechanical | Sanity that the `auth: none` row was read. |

**Important: this is a stub.** The interesting volume signal is at 40 endpoints, not 6. Expand `SPEC.md` (add 34 more stanzas in the same format) and bump the oracle's min to 38 / max to 41 before drawing conclusions.
