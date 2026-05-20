from slow import has_duplicates


def test_basic_no_dup():
    assert has_duplicates([1, 2, 3]) is False


def test_basic_dup():
    assert has_duplicates([1, 2, 1]) is True


def test_empty():
    assert has_duplicates([]) is False


if __name__ == "__main__":
    test_basic_no_dup()
    test_basic_dup()
    test_empty()
    print("B10 tests OK")
