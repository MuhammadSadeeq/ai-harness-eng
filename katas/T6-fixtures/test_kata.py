from kata import apply_discount, cart_total


def sample_cart():
    """A fixture: the setup every cart test needs, built fresh each time."""
    return [("tea", 300), ("cake", 450)]


def test_each_case_is_checked_on_its_own():
    cases = [(1000, 0, 1000), (1000, 10, 900), (999, 10, 900), (1, 100, 0)]
    for price, percent, expected in cases:
        assert apply_discount(price, percent) == expected, f"{price} at {percent} percent"


def test_a_percent_outside_0_to_100_is_refused():
    for bad in (-1, 101):
        try:
            apply_discount(100, bad)
        except ValueError:
            continue
        assert False, f"percent {bad} should be refused"


def test_the_cart_total_uses_the_fixture():
    assert cart_total(sample_cart(), 10) == 675, "750 less 10 percent is 675"


def test_the_fixture_is_fresh_each_time():
    first = sample_cart()
    first.append(("extra", 1))
    assert sample_cart() == [("tea", 300), ("cake", 450)], "a new cart each time, not the one changed above"
