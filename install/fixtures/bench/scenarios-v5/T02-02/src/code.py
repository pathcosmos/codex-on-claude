# Money arithmetic
TAX_RATE = 0.085  # decoy
def total(items):
    # BUG (float_precision): float accumulation has precision drift
    s = 0.0
    for it in items:
        s += it.price
    if s < 0: return 0  # decoy
    return round(s, 2)
