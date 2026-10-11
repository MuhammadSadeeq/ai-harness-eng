from kata import should_retry, backoff_ms, breaker_open


def test_transient_errors_retry_until_the_last_attempt():
    assert should_retry("overloaded", 1, 5) is True, "the first failure of an overloaded call retries"
    assert should_retry("rate_limit", 4, 5) is True, "attempt 4 of 5 still has one left"
    assert should_retry("overloaded", 5, 5) is False, "the last attempt has no retry after it"


def test_a_permanent_error_never_retries():
    assert should_retry("invalid_request", 1, 10) is False, "a bad request fails the same way every time"


def test_the_wait_doubles_each_attempt():
    waits = [backoff_ms(a, 200, 5000, "none") for a in (1, 2, 3)]
    assert waits == [200, 400, 800], "base 200, doubled each time"


def test_the_wait_stops_at_the_cap():
    assert backoff_ms(10, 200, 5000, "none") == 5000, "the cap holds the wait at 5000 ms"


def test_full_jitter_stays_between_zero_and_the_base():
    wait = backoff_ms(2, 200, 5000, "full", draw=12345)
    assert wait == 12345 % 401, "the wait is the draw modulo base + 1, base being 400 here"
    assert 0 <= wait <= 400, "full jitter never waits longer than the base"


def test_a_zero_draw_waits_nothing_under_full_jitter():
    assert backoff_ms(3, 200, 5000, "full", draw=0) == 0, "draw 0 is the bottom of the range"


def test_the_breaker_opens_at_the_threshold():
    assert breaker_open(2, 3) is False, "two in a row, threshold three: still closed"
    assert breaker_open(3, 3) is True, "the threshold itself opens it"


def test_an_unknown_jitter_is_refused():
    try:
        backoff_ms(1, 200, 5000, "half")
    except ValueError:
        return
    raise AssertionError("only none and full are jitter modes")


def test_an_error_that_is_not_listed_is_permanent():
    assert should_retry("refusal", 1, 5) is False
