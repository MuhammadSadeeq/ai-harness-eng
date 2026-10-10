"""ENGINE.md A5.3: first_block_only, the harness reads tool calls from content[0] only."""

from __future__ import annotations

from typing import Any

from support import make_board, make_tape, of_kind, run

from rein.harness import Harness
from rein.pricing import resolve_prices
from rein.spec import MISSING_RESULT_MESSAGE

FIRST = {"first_block_only": {}}
RUN_TESTS = [["run_command", {"cmd": "pytest -q"}]]


def failing_tape(script: list[dict[str, Any]]) -> Any:
    return make_tape(script=script, checks=[{"file": "a.txt", "contains": "bye"}])


def test_the_first_call_runs_and_the_next_one_is_missed_then_fails() -> None:
    script: list[dict[str, Any]] = [
        {"tools": [["read_file", {"path": "a.txt"}], ["read_file", {"path": "a.txt"}]]},
        {"say": "after"},
    ]
    result = run(make_tape(script=script), FIRST)
    assert len(of_kind(result, "tool_call")) == 1
    assert len(of_kind(result, "model_reply")[0]["tool_uses"]) == 2
    assert MISSING_RESULT_MESSAGE in [event["message"] for event in of_kind(result, "model_error")]
    assert result.status == "error"


def test_text_before_the_tool_use_means_no_call_is_read() -> None:
    script: list[dict[str, Any]] = [{"say": "I'll run the tests first.", "tools": RUN_TESTS}]
    result = run(failing_tape(script), FIRST)
    assert of_kind(result, "tool_call") == []
    reply = of_kind(result, "model_reply")[0]
    assert reply["stop_reason"] == "tool_use"
    assert [use["name"] for use in reply["tool_uses"]] == ["run_command"]
    assert result.status == "done"
    assert result.passed is False


def test_without_the_module_the_same_reply_runs_the_tool() -> None:
    script: list[dict[str, Any]] = [{"say": "I'll run the tests first.", "tools": RUN_TESTS}]
    result = run(failing_tape(script), {})
    assert [event["tool"] for event in of_kind(result, "tool_call")] == ["run_command"]


def test_a_reply_without_tool_use_is_unchanged_by_the_module() -> None:
    tape = make_tape(script=[{"say": "done"}])
    assert run(tape, FIRST).status == "done"
    assert run(tape, {}).status == "done"


def test_the_stored_assistant_message_is_the_full_reply() -> None:
    tape = failing_tape([{"say": "I'll run the tests first.", "tools": RUN_TESTS}])
    harness = Harness(tape, make_board(FIRST), 1, resolve_prices(tape.pricing, None))
    harness.run()
    assistant = harness.messages[1]
    assert assistant["role"] == "assistant"
    assert [block["type"] for block in assistant["content"]] == ["text", "tool_use"]


def test_an_interrupt_needs_a_call_the_harness_read() -> None:
    # A5.5(b): text first means no call was read, so the interrupt does not fire.
    tape = make_tape(
        script=[{"say": "I'll run the tests first.", "tools": RUN_TESTS}],
        interrupt={"turn": 1, "resume": False},
    )
    assert of_kind(run(tape, FIRST), "interrupt") == []
    assert run(tape, FIRST).status == "done"
    assert run(tape, {}).status == "interrupted"


def test_an_interrupt_lists_only_the_calls_the_harness_read() -> None:
    script: list[dict[str, Any]] = [
        {"tools": [["read_file", {"path": "a.txt"}], ["read_file", {"path": "a.txt"}]]}
    ]
    tape = make_tape(script=script, interrupt={"turn": 1, "resume": False})
    interrupts = of_kind(run(tape, FIRST), "interrupt")
    assert len(interrupts) == 1
    assert len(interrupts[0]["pending"]) == 1
