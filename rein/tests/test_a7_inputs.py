"""ENGINE.md A7.1 and A7.4: validate_inputs, the schema subset, and the order of a call."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape, of_kind, run

from rein.inputs import check_input

SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "integer"},
        "mode": {"type": "string", "enum": ["fast", "slow"]},
    },
    "required": ["id"],
    "additionalProperties": False,
}
LOOKUP = {
    "name": "lookup",
    "description": "Look up a record by id.",
    "input_schema": SCHEMA,
    "latency_ms": 50,
    "results": [],
    "default": {"output": "found", "ok": True},
}
VALIDATE = {"validate_inputs": {}}


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def tape_with(call: tuple[str, dict[str, Any]]) -> Any:
    """One reply that asks for one call, then a done claim."""
    name, args = call
    return make_tape(custom_tools=[LOOKUP], script=[{"tools": [[name, args]]}, {"say": "done"}])


def results_of(result: Any) -> list[dict[str, Any]]:
    # The tool results the next request carries: the last user message after a tool turn.
    later = [entry for entry in requests(result) if len(entry["messages"]) >= 3]
    return [
        block for block in later[0]["messages"][-1]["content"] if block.get("type") == "tool_result"
    ]


@pytest.mark.parametrize(
    ("input_value", "reason"),
    [
        ({}, "missing required field: id"),
        ({"id": "7"}, "field id must be integer"),
        ({"id": True}, "field id must be integer"),
        ({"id": 7, "extra": 1}, "unknown field: extra"),
        ({"id": 7, "mode": "medium"}, 'field mode must be one of: "fast", "slow"'),
    ],
)
def test_each_failure_names_its_reason(input_value: dict[str, Any], reason: str) -> None:
    assert check_input(input_value, SCHEMA) == reason


def test_a_valid_input_has_no_reason() -> None:
    assert check_input({"id": 7, "mode": "fast"}, SCHEMA) == ""


def test_the_input_must_be_an_object() -> None:
    assert check_input([1], SCHEMA) == "input must be an object"


def test_the_first_failure_wins_required_before_unknown_fields() -> None:
    assert check_input({"extra": 1}, SCHEMA) == "missing required field: id"


def test_number_accepts_integers_and_booleans_are_not_integers() -> None:
    number = {"type": "object", "properties": {"x": {"type": "number"}}}
    assert check_input({"x": 3}, number) == ""
    assert check_input({"x": False}, number) == "field x must be number"


def test_an_invalid_call_is_not_run_and_its_result_says_why() -> None:
    result = run(tape_with(("lookup", {})), VALIDATE)
    checks = of_kind(result, "input_check")
    assert checks[0]["valid"] is False
    assert checks[0]["reason"] == "missing required field: id"
    assert of_kind(result, "tool_call") == []
    [block] = results_of(result)
    assert block["content"] == "Invalid input: missing required field: id"
    assert block["is_error"] is True


def test_a_valid_call_runs_after_its_check() -> None:
    result = run(tape_with(("lookup", {"id": 7})), VALIDATE)
    assert of_kind(result, "input_check")[0]["valid"] is True
    assert of_kind(result, "input_check")[0]["reason"] == ""
    assert len(of_kind(result, "tool_call")) == 1


def test_an_unknown_tool_is_not_checked() -> None:
    tape = make_tape(
        tools=["read_file"], script=[{"tools": [["list_files", {"path": 5}]]}, {"say": "done"}]
    )
    checks = of_kind(run(tape, VALIDATE), "input_check")
    assert checks[0]["valid"] is True
    assert checks[0]["reason"] == ""


def test_without_the_module_inputs_run_as_given() -> None:
    result = run(tape_with(("lookup", {})), {})
    assert of_kind(result, "input_check") == []
    assert len(of_kind(result, "tool_call")) == 1


def test_the_permission_comes_before_the_input_check() -> None:
    result = run(
        tape_with(("lookup", {})), {"permissions": {"mode": "deny", "rules": []}, **VALIDATE}
    )
    assert of_kind(result, "input_check") == []
