from kata import add


def test_adds_small_numbers():
    assert add(2, 3) == 5, "2 + 3 should be 5"


def test_adds_across_zero():
    assert add(-1, 1) == 0
