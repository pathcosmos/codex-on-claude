def running_average(values):
    """Compute the running average. Result[i] = mean(values[0..i] inclusive)."""
    if not values:
        return []
    out = []
    total = 0
    for i, v in enumerate(values):
        total += v
        # BUG: off-by-one — divides by i (0-indexed) instead of i+1.
        out.append(total / i)
    return out
