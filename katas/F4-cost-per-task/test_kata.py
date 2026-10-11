from kata import cost_per_completed

RUNS = [
    {"status": "done", "passed": True, "cost": 100},
    {"status": "done", "passed": False, "cost": 100},
    {"status": "max_turns", "passed": False, "cost": 50},
    {"status": "done", "passed": True, "cost": 150},
]


def test_all_the_cost_divided_by_the_completed_runs():
    assert cost_per_completed(RUNS) == 200, "400 in all over 2 completed runs"


def test_a_false_done_does_not_complete():
    got = cost_per_completed([
        {"status": "done", "passed": False, "cost": 90},
        {"status": "done", "passed": True, "cost": 10},
    ])
    assert got == 100, "the false done's cost counts, but only the true done completes"


def test_a_guard_stopped_run_does_not_complete_even_with_files_right():
    got = cost_per_completed([
        {"status": "max_turns", "passed": True, "cost": 30},
        {"status": "done", "passed": True, "cost": 70},
    ])
    assert got == 100


def test_no_completed_run_gives_none():
    assert cost_per_completed([{"status": "done", "passed": False, "cost": 5}]) is None
    assert cost_per_completed([]) is None


def test_the_result_is_floored_to_an_integer():
    got = cost_per_completed([
        {"status": "done", "passed": True, "cost": 10},
        {"status": "done", "passed": True, "cost": 10},
        {"status": "done", "passed": False, "cost": 1},
    ])
    assert got == 10 and isinstance(got, int), "21 over 2 completed floors to 10"


def test_the_order_of_runs_does_not_change_the_result():
    assert cost_per_completed(list(reversed(RUNS))) == cost_per_completed(RUNS)
