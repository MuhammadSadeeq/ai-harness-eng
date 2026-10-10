"""ENGINE.md A9.3 and A9.4: the tests suite and pristine gate, and the cost event."""

from __future__ import annotations

from typing import Any

import pytest
from support import kinds, make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.tape import TapeError

TEST_A = {
    "id": "t-a",
    "marker": {"file": "tests/a.txt", "contains": "a"},
    "check": {"file": "a.txt", "contains": "hello"},
}
PRICED = {
    "input_milli_per_mtok": 1000,
    "output_milli_per_mtok": 2000,
    "cache_write_milli_per_mtok": 1250,
    "cache_read_milli_per_mtok": 100,
}
DONE: list[dict[str, Any]] = [{"say": "done"}]


def verdicts(modules: dict[str, Any] | None = None, **changes: Any) -> list[tuple[str, bool]]:
    board = modules if modules is not None else {"verify_gate": {"max_feedback": 0}}
    result = run(make_tape(**changes), board)
    return [(str(event["check"]), bool(event["passed"])) for event in of_kind(result, "verify")]


def test_an_active_test_fails_the_gate_when_its_check_fails() -> None:
    got = verdicts(workspace={"a.txt": "bad\n", "tests/a.txt": "a\n"}, tests=[TEST_A], script=DONE)
    assert got == [("tests", False)]


def test_a_test_with_no_marker_or_without_its_text_is_skipped() -> None:
    no_marker = verdicts(workspace={"a.txt": "bad\n"}, tests=[TEST_A], script=DONE)
    wrong_text = verdicts(
        workspace={"a.txt": "bad\n", "tests/a.txt": "b\n"}, tests=[TEST_A], script=DONE
    )
    assert no_marker == [("tests", True)]
    assert wrong_text == [("tests", True)]


def test_not_contains_passes_only_while_the_text_is_absent() -> None:
    test = {**TEST_A, "check": {"file": "a.txt", "not_contains": "bad"}}
    good = verdicts(workspace={"a.txt": "good\n", "tests/a.txt": "a\n"}, tests=[test], script=DONE)
    bad = verdicts(workspace={"a.txt": "bad\n", "tests/a.txt": "a\n"}, tests=[test], script=DONE)
    assert good == [("tests", True)]
    assert bad == [("tests", False)]


def test_a_missing_check_file_fails_an_active_test() -> None:
    test = {**TEST_A, "check": {"file": "calc.py", "contains": "a + b"}}
    got = verdicts(workspace={"tests/a.txt": "a\n"}, tests=[test], script=DONE)
    assert got == [("tests", False)]


def test_the_plain_gate_reads_live_markers_and_the_pristine_gate_the_originals() -> None:
    script: list[dict[str, Any]] = [
        {
            "say": "Clearing the marker.",
            "tools": [["write_file", {"path": "tests/a.txt", "content": ""}]],
        },
        {"say": "done"},
    ]
    workspace = {"a.txt": "bad\n", "tests/a.txt": "a\n"}
    plain = verdicts(workspace=workspace, tests=[TEST_A], script=script)
    pristine = verdicts(
        {"verify_gate": {"max_feedback": 0, "pristine_tests": True}},
        workspace=workspace,
        tests=[TEST_A],
        script=script,
    )
    assert plain == [("tests", True)]
    assert pristine == [("tests (pristine)", False)]


def test_run_command_reads_the_live_markers() -> None:
    script: list[dict[str, Any]] = [
        {"say": "Running.", "tools": [["run_command", {"cmd": "pytest -q"}]]},
        {"say": "Clearing.", "tools": [["write_file", {"path": "tests/a.txt", "content": ""}]]},
        {"say": "Running again.", "tools": [["run_command", {"cmd": "pytest -q"}]]},
        {"say": "done"},
    ]
    result = run(
        make_tape(workspace={"a.txt": "bad\n", "tests/a.txt": "a\n"}, tests=[TEST_A], script=script)
    )
    outputs = [
        event["output"] for event in of_kind(result, "tool_call") if event["tool"] == "run_command"
    ]
    assert outputs == ["1 failed", "2 passed"]


@pytest.mark.parametrize(
    "tests",
    [
        "not a list",
        [{**TEST_A, "extra": 1}],
        [TEST_A, TEST_A],
        [{**TEST_A, "marker": {"file": "tests/a.txt"}}],
        [{**TEST_A, "check": {"file": "a.txt", "contains": "x", "not_contains": "y"}}],
        [{**TEST_A, "check": {"file": "a.txt"}}],
    ],
)
def test_the_loader_refuses_malformed_tests(tests: Any) -> None:
    with pytest.raises(TapeError):
        make_tape(tests=tests)


def test_pristine_tests_must_be_a_boolean() -> None:
    with pytest.raises(BoardError):
        board_from_dict(
            {"id": "b", "label": "B", "modules": {"verify_gate": {"pristine_tests": "yes"}}}
        )


def test_cost_attribution_takes_no_parameters() -> None:
    with pytest.raises(BoardError):
        board_from_dict({"id": "b", "label": "B", "modules": {"cost_attribution": {"top": 1}}})


def test_each_cost_event_follows_its_reply_and_splits_the_call() -> None:
    script: list[dict[str, Any]] = [
        {"say": "Listing.", "tools": [["list_files", {}]]},
        {"say": "Listing again.", "tools": [["list_files", {}]]},
        {"say": "done"},
    ]
    tape = make_tape(
        pricing=PRICED, cache_rules={"min_tokens": 1, "ttl_ms": 10000000}, script=script
    )
    result = run(tape, {"cost_attribution": {}, "cache": {}})
    sequence = kinds(result)
    replies = [i for i, kind in enumerate(sequence) if kind == "model_reply"]
    assert [sequence[i + 1] for i in replies] == ["cost"] * len(replies)

    costs = of_kind(result, "cost")
    caches = of_kind(result, "cache")
    replies_events = of_kind(result, "model_reply")
    assert len(costs) == len(caches) == len(replies_events) == 3
    for cost, cache, reply in zip(costs, caches, replies_events, strict=True):
        assert cost["input_cost"] == cache["uncached"] * 1000
        assert cost["output_cost"] == reply["usage"]["output_tokens"] * 2000
        assert cost["cache_cost"] == cache["write"] * 1250 + cache["read"] * 100
        assert cost["call_cost"] == cost["input_cost"] + cost["output_cost"] + cost["cache_cost"]
    assert costs[0]["cache_cost"] > 0  # the first call writes the prefix
    assert costs[1]["cache_cost"] > 0  # the second reads it and writes the new tail


def test_a_marker_the_model_adds_switches_nothing_on_under_pristine() -> None:
    script: list[dict[str, Any]] = [
        {
            "say": "Adding a marker.",
            "tools": [["write_file", {"path": "tests/a.txt", "content": "a"}]],
        },
        {"say": "done"},
    ]
    workspace = {"a.txt": "bad\n"}
    plain = verdicts(workspace=workspace, tests=[TEST_A], script=script)
    pristine = verdicts(
        {"verify_gate": {"max_feedback": 0, "pristine_tests": True}},
        workspace=workspace,
        tests=[TEST_A],
        script=script,
    )
    assert plain == [("tests", False)]
    assert pristine == [("tests (pristine)", True)]


def test_pristine_tests_without_a_suite_has_no_effect() -> None:
    got = verdicts(
        {"verify_gate": {"max_feedback": 0, "pristine_tests": True}},
        workspace={"a.txt": "hello\n"},
        script=DONE,
    )
    assert got == [("tests", True)]


def test_top_part_is_measured_on_the_request_as_sent() -> None:
    script: list[dict[str, Any]] = [
        {"say": "Listing.", "tools": [["list_files", {}]]},
        {"say": " ".join(["word"] * 2000)},
    ]
    result = run(make_tape(pricing=PRICED, script=script), {"cost_attribution": {}})
    second = of_kind(result, "cost")[1]
    assert second["top_part"] in {"system", "tools", "messages[0]", "messages[1]", "messages[2]"}
    assert second["top_tokens"] < 1000  # the 2000-word reply (messages[3]) is not in the request
