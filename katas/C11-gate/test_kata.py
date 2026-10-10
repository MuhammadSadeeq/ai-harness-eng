from kata import verify

ORIGINAL = {"t_add": "assert add(1, 2) == 3", "t_sub": "assert sub(3, 1) == 2"}


def all_pass(suite):
    return True


def some_fail(suite):
    return False


def test_an_untouched_suite_passes_when_it_passes():
    result = verify(dict(ORIGINAL), ORIGINAL, all_pass)
    assert result["passed"] is True, "an untouched suite that passes is a pass"


def test_an_untouched_suite_that_fails_says_so():
    result = verify(dict(ORIGINAL), ORIGINAL, some_fail)
    assert result["passed"] is False and result["reason"], "a failing run fails and gives a reason"


def test_an_edited_test_is_refused_even_if_it_passes():
    edited = dict(ORIGINAL, t_add="assert add(1, 2) == 1 + 2 or True")
    result = verify(edited, ORIGINAL, all_pass)
    assert result["passed"] is False, "an edited test must not pass the gate"
    assert "changed" in result["reason"], "the reason says the tests were changed"


def test_a_removed_test_is_refused():
    removed = {"t_add": ORIGINAL["t_add"]}
    assert verify(removed, ORIGINAL, all_pass)["passed"] is False, "a removed test must not pass the gate"


def test_an_added_test_is_refused():
    added = dict(ORIGINAL, t_new="assert True")
    assert verify(added, ORIGINAL, all_pass)["passed"] is False, "an added test must not pass the gate"


def test_the_original_suite_is_the_one_run():
    seen = []

    def spy(suite):
        seen.append(suite)
        return True

    verify(dict(ORIGINAL), ORIGINAL, spy)
    assert seen == [ORIGINAL], "the gate runs the original tests, not the workspace's copy"


def test_an_error_in_the_run_is_a_failure():
    def broken(suite):
        raise RuntimeError("the runner crashed")

    result = verify(dict(ORIGINAL), ORIGINAL, broken)
    assert result["passed"] is False, "an exception is a failure, not a pass"
