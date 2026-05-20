from buggy import running_average


def test_empty():
    assert running_average([]) == []


def test_singleton():
    assert running_average([4]) == [4]


def test_basic():
    assert running_average([1, 2, 3, 4]) == [1, 1.5, 2, 2.5]


if __name__ == "__main__":
    test_empty()
    test_singleton()
    test_basic()
    print("B3 tests OK")
