from kata import run_eval

RUNS = [
    {"task": "a", "trial": 1, "status": "done", "passed": True},
    {"task": "a", "trial": 2, "status": "done", "passed": False},
    {"task": "b", "trial": 1, "status": "max_turns", "passed": True},
    {"task": "b", "trial": 2, "status": "done", "passed": True},
    {"task": "c", "trial": 1, "status": "done", "passed": False},
    {"task": "c", "trial": 2, "status": "max_turns", "passed": False},
]


def test_a_run_passes_only_as_a_true_done():
    assert run_eval(RUNS)["passes"] == 2


def test_a_guard_stopped_run_does_not_pass_even_with_files_right():
    got = run_eval([{"task": "x", "trial": 1, "status": "max_turns", "passed": True}])
    assert got["passes"] == 0 and got["tasks_any_pass"] == 0


def test_a_false_done_does_not_pass():
    got = run_eval([{"task": "x", "trial": 1, "status": "done", "passed": False}])
    assert got["passes"] == 0


def test_pass_at_k_counts_tasks_with_at_least_one_pass():
    assert run_eval(RUNS)["tasks_any_pass"] == 2


def test_pass_hat_k_counts_tasks_where_every_trial_passes():
    got = run_eval([
        {"task": "x", "trial": 1, "status": "done", "passed": True},
        {"task": "x", "trial": 2, "status": "done", "passed": True},
        {"task": "y", "trial": 1, "status": "done", "passed": True},
        {"task": "y", "trial": 2, "status": "done", "passed": False},
    ])
    assert got["tasks_all_pass"] == 1 and got["tasks_any_pass"] == 2 and got["passes"] == 3


def test_the_order_of_trials_does_not_change_the_counts():
    assert run_eval(list(reversed(RUNS))) == run_eval(RUNS)


def test_no_trials_gives_zeros():
    assert run_eval([]) == {"runs": 0, "passes": 0, "tasks_any_pass": 0, "tasks_all_pass": 0}
