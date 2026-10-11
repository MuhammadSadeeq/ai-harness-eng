from kata import wilson, differ


def close(x, y):
    return abs(x - y) < 1e-3


def test_zero_of_ten_starts_at_zero_and_ends_near_a_quarter():
    lo, hi = wilson(0, 10)
    assert lo == 0.0 and close(hi, 0.2775)


def test_ten_of_ten_ends_at_one_and_starts_near_three_quarters():
    lo, hi = wilson(10, 10)
    assert close(lo, 0.7225) and close(hi, 1.0)


def test_eight_of_ten_is_about_0_49_to_0_94():
    lo, hi = wilson(8, 10)
    assert close(lo, 0.4902) and close(hi, 0.9433)


def test_sixty_of_a_hundred_is_about_0_50_to_0_69():
    lo, hi = wilson(60, 100)
    assert close(lo, 0.5020) and close(hi, 0.6906)


def test_the_interval_contains_the_pass_rate():
    for passed, n in [(0, 10), (1, 3), (8, 10), (60, 100), (99, 100)]:
        lo, hi = wilson(passed, n)
        assert lo <= passed / n <= hi, (passed, n)
        assert 0.0 <= lo <= hi <= 1.0, (passed, n)


def test_two_of_ten_and_eight_of_ten_overlap_so_they_do_not_differ():
    assert differ((2, 10), (8, 10)) is False


def test_one_of_a_hundred_and_sixty_of_a_hundred_differ():
    assert differ((1, 100), (60, 100)) is True


def test_a_result_does_not_differ_from_itself():
    assert differ((50, 100), (50, 100)) is False
