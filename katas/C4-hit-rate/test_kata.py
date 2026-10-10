from kata import hit_percent, saving_percent


def test_hit_percent_counts_the_read_tokens():
    assert hit_percent({"input_tokens": 40, "cache_read_input_tokens": 960}) == 96, "96 of 1000 input tokens were read"


def test_hit_percent_counts_every_input_token_in_the_total():
    usage = {"input_tokens": 100, "cache_creation_input_tokens": 300, "cache_read_input_tokens": 600}
    assert hit_percent(usage) == 60, "600 read out of 1000 in all, the 300 written are in the total"


def test_hit_percent_rounds_down():
    assert hit_percent({"input_tokens": 1, "cache_read_input_tokens": 999}) == 99, "99.9 rounds down to 99"


def test_hit_percent_is_zero_with_no_input():
    assert hit_percent({}) == 0, "no input at all is 0, not a division error"
    assert hit_percent({"input_tokens": 0}) == 0, "zero total is 0"


def test_first_call_that_only_writes_has_no_hit():
    assert hit_percent({"cache_creation_input_tokens": 653}) == 0, "a write is not a read"


def test_saving_on_a_hit():
    usage = {"input_tokens": 40, "cache_read_input_tokens": 960}
    assert saving_percent(usage) == 91, "reads cost 0.05x, so 88 of 1000 base units: 91 percent saved"


def test_saving_is_negative_on_a_first_write():
    assert saving_percent({"cache_creation_input_tokens": 653}) == -25, "a write costs 1.25x, so it is 25 percent dearer"


def test_saving_is_zero_with_no_input():
    assert saving_percent({}) == 0, "no input, no saving"
