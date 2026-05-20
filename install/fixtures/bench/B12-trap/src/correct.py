def is_prime(n: int) -> bool:
    """Return True iff n is a positive prime integer.

    Correctness notes:
    - n < 2 → False (1 is not prime; negatives/zero are not prime).
    - n == 2 → True (only even prime).
    - Even n > 2 → False, fast-path.
    - For odd candidates, check divisibility by odd d in [3, isqrt(n)].
    """
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    d = 3
    while d * d <= n:
        if n % d == 0:
            return False
        d += 2
    return True
