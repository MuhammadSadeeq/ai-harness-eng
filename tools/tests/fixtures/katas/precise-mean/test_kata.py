from kata import mean


def test_mean_of_three():
    assert mean([1, 2, 4]) == 7 / 3, "the exact mean of 1, 2 and 4"


def test_mean_of_two():
    assert mean([1, 2]) == 1.5
