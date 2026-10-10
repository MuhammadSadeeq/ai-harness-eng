from kata import run_turns

# A step that is never "done" would loop forever in a wrong solution. The guard stops it.
GUARD = 50


class Steps:
    """Returns the answers in turn; after the last one, it keeps returning the last one."""

    def __init__(self, answers):
        self.answers = answers
        self.calls = 0

    def __call__(self):
        self.calls += 1
        if self.calls > GUARD:
            raise RuntimeError("step() was called more than 50 times: the loop has no second exit yet.")
        return self.answers[min(self.calls, len(self.answers)) - 1]


def test_returns_done_when_step_says_done():
    steps = Steps(["working", "working", "done"])
    assert run_turns(steps, 5) == "done", "the loop should stop at done"
    assert steps.calls == 3, "step should be called until it says done"


def test_done_on_the_last_allowed_turn_counts():
    steps = Steps(["working", "working", "done"])
    assert run_turns(steps, 3) == "done", "done on turn 3 of 3 is still done"
    assert steps.calls == 3


def test_stops_at_max_turns_when_never_done():
    steps = Steps(["working"])
    assert run_turns(steps, 3) == "max_turns", "after 3 turns without done, return max_turns"
    assert steps.calls == 3, "step must not be called a fourth time"


def test_a_limit_of_one_allows_one_call():
    steps = Steps(["working"])
    assert run_turns(steps, 1) == "max_turns"
    assert steps.calls == 1


def test_stops_at_the_limit_even_if_done_comes_later():
    steps = Steps(["working", "working", "done"])
    assert run_turns(steps, 2) == "max_turns", "done after the limit must not count"
    assert steps.calls == 2
