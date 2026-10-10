import copy

from kata import new_state, end, close_books


def test_new_state_starts_with_the_task():
    s = new_state("fix add()")
    assert s["messages"] == [{"role": "user", "content": "fix add()"}], "the task is the first message"
    assert s["turn"] == 0 and s["status"] is None, "a new run is on turn 0 with no status"


def test_end_sets_the_status():
    s = end(new_state("t"), "done")
    assert s["status"] == "done", "the status is the one that ended the run"


def test_a_second_end_is_refused():
    s = end(new_state("t"), "done")
    try:
        end(s, "error")
    except RuntimeError as exc:
        assert "done" in str(exc), "the message names the status that already ended the run"
    else:
        raise AssertionError("a run has one final status; a second end must raise")


def test_an_unknown_status_is_refused():
    try:
        end(new_state("t"), "finished")
    except ValueError:
        return
    raise AssertionError("only the four statuses are allowed")


def test_close_books_answers_every_pending_call_in_one_message():
    s = new_state("t")
    before = len(s["messages"])
    close_books(s, ["toolu_1_1", "toolu_1_2"])
    assert len(s["messages"]) == before + 1, "one new message holds every result"
    results = s["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["toolu_1_1", "toolu_1_2"], "one result per pending id, in order"
    assert all(r["is_error"] is True for r in results), "an interrupted call is an error result"
    assert all(r["type"] == "tool_result" for r in results), "each block is a tool_result"


def test_close_books_keeps_the_history_append_only():
    s = new_state("t")
    s["messages"].append({"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_1_1", "name": "x", "input": {}}]})
    earlier = copy.deepcopy(s["messages"])
    close_books(s, ["toolu_1_1"])
    assert s["messages"][:len(earlier)] == earlier, "no earlier message is changed or removed"


def test_close_books_with_nothing_pending_changes_nothing():
    s = new_state("t")
    before = copy.deepcopy(s)
    close_books(s, [])
    assert s == before, "with no pending call the state stays as it was"


def test_the_run_still_has_one_exit_after_close_books():
    s = close_books(new_state("t"), ["toolu_1_1"])
    end(s, "interrupted")
    assert s["status"] == "interrupted", "closing the books does not end the run by itself"
