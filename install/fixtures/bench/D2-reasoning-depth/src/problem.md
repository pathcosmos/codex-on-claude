# Constraint puzzle — modified N-Queens

Place exactly **6 queens** on an **8×8** chessboard such that ALL of these constraints hold simultaneously:

1. **Standard non-attacking**: no two queens share a row, column, or diagonal.
2. **Forbidden squares**: the queens may NOT occupy any of these 8 squares: `(0,0), (0,7), (7,0), (7,7), (3,3), (3,4), (4,3), (4,4)`. (Corners + center 2×2.)
3. **Parity rule**: the sum of all row indices must equal the sum of all column indices. (`Σ rᵢ == Σ cᵢ`.)
4. **Color rule**: at least 4 queens must sit on **light** squares. (Light = `(r+c) % 2 == 0`.)

A queen at `(r, c)` uses 0-indexed coordinates with row 0 at the top.

## Output format

Output the placement as a fenced ```json block:

```json
{ "queens": [[r1, c1], [r2, c2], ..., [r6, c6]] }
```

After the JSON, briefly explain how each constraint is satisfied.

If you believe no solution exists, output `{"queens": []}` and explain.
