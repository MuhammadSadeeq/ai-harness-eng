from kata import calibrate

PAIRS = [(True, True), (True, False), (False, False), (False, True), (True, True)]


def test_agreement_is_counted_over_every_case():
    got = calibrate(PAIRS)
    assert got["of"] == 5 and got["agree"] == 3
    assert abs(got["agreement"] - 0.6) < 1e-9


def test_a_false_pass_is_a_model_pass_the_human_failed():
    assert calibrate(PAIRS)["false_passes"] == 1


def test_a_false_fail_is_a_model_fail_the_human_passed():
    assert calibrate(PAIRS)["false_fails"] == 1


def test_a_grader_that_always_passes_agrees_only_on_human_passes():
    got = calibrate([(True, True), (True, False), (True, False), (True, True)])
    assert got["agree"] == 2 and abs(got["agreement"] - 0.5) < 1e-9 and got["false_passes"] == 2


def test_no_cases_gives_zero_agreement_and_no_errors():
    assert calibrate([]) == {"of": 0, "agree": 0, "agreement": 0.0, "false_passes": 0, "false_fails": 0}


def test_the_order_of_cases_does_not_change_the_result():
    assert calibrate(list(reversed(PAIRS))) == calibrate(PAIRS)
