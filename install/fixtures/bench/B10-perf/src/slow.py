def has_duplicates(items):
    """Return True iff items contains any duplicate value.

    Current implementation: O(n^2) nested loop. The task is to spot this
    and propose an O(n) replacement.
    """
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j]:
                return True
    return False
