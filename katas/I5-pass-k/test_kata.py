from kata import pass_k


def close(a, b):
    return abs(a - b) < 1e-9


def test_k_one_is_the_pass_rate_for_both():
    at, hat = pass_k([[True, False, True, False]], 1)
    assert close(at, 0.5), "pass@1 is the share of trials that pass"
    assert close(hat, 0.5), "pass^1 is the same share"


def test_when_every_trial_passes_both_are_one():
    at, hat = pass_k([[True, True, True, True]], 2)
    assert close(at, 1.0) and close(hat, 1.0), "all passes: pass@2 and pass^2 are both 1"


def test_when_no_trial_passes_both_are_zero():
    at, hat = pass_k([[False, False, False, False]], 2)
    assert close(at, 0.0) and close(hat, 0.0), "no passes: pass@2 and pass^2 are both 0"


def test_a_mixed_row_at_k_two():
    at, hat = pass_k([[True, True, False, False]], 2)
    assert close(at, 5 / 6), "pass@2 is 1 - C(2, 2) / C(4, 2) = 5/6"
    assert close(hat, 1 / 6), "pass^2 is C(2, 2) / C(4, 2) = 1/6"


def test_k_equal_to_the_trials():
    at, hat = pass_k([[True, True, False, False]], 4)
    assert close(at, 1.0), "with 4 tries and 2 passes, one of the tries passes for sure"
    assert close(hat, 0.0), "all 4 tries cannot pass, so pass^4 is 0"


def test_the_average_is_over_tasks():
    at, hat = pass_k([[True, True, False, False], [False, False, False, False]], 2)
    assert close(at, 5 / 12), "pass@2 averages 5/6 and 0 over the two tasks"
    assert close(hat, 1 / 12), "pass^2 averages 1/6 and 0 over the two tasks"


def test_tasks_with_different_numbers_of_trials():
    at, hat = pass_k([[True, False], [True, True, True]], 1)
    assert close(at, 0.75) and close(hat, 0.75), "the two tasks average 0.5 and 1.0, not the pooled trials"
