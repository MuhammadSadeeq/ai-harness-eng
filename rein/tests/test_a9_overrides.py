"""ENGINE.md A9.1: tool overrides, through small tapes."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import CallContext, condition_holds
from rein.tools import load_tooldefs

WRITE = ["write_file", {"path": "a.txt", "content": "x"}]
CUSTOM = {
    "name": "note",
    "description": "Save text.",
    "input_schema": {
        "type": "object",
        "properties": {"text": {"type": "string"}},
        "additionalProperties": False,
    },
    "latency_ms": 100,
    "results": [],
    "default": {"output": "Saved.", "ok": True},
}


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def tools_of(entry: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {tool["name"]: tool for tool in entry["tools"]}


def test_an_override_replaces_the_description_in_the_request() -> None:
    tape = make_tape(tools=["write_file"], script=[{"tools": [WRITE]}, {"say": "done"}])
    board = {"tool_overrides": {"write_file": {"description": "Overwrites a whole file."}}}
    first = tools_of(requests(run(tape, board))[0])
    assert first["write_file"]["description"] == "Overwrites a whole file."
    assert "write_file" in first  # the name cannot change


def test_without_the_module_the_definition_is_the_tooldefs_one() -> None:
    tape = make_tape(tools=["write_file"], script=[{"say": "done"}])
    sent = tools_of(requests(run(tape, {}))[0])["write_file"]
    expected = next(d for d in load_tooldefs() if d["name"] == "write_file")
    assert sent["description"] == expected["description"]


def test_an_override_of_a_custom_tool_applies_too() -> None:
    tape = make_tape(custom_tools=[CUSTOM], script=[{"say": "done"}])
    board = {"tool_overrides": {"note": {"description": "Appends a line to the notes."}}}
    assert (
        tools_of(requests(run(tape, board))[0])["note"]["description"]
        == "Appends a line to the notes."
    )


def test_the_input_schema_override_is_what_validate_inputs_checks() -> None:
    schema = {
        "type": "object",
        "properties": {"path": {"type": "string"}, "note": {"type": "string"}},
        "required": ["path", "note"],
        "additionalProperties": False,
    }
    tape = make_tape(tools=["write_file"], script=[{"tools": [WRITE]}, {"say": "done"}])
    default = of_kind(run(tape, {"validate_inputs": {}}), "input_check")
    assert default[0]["valid"] is True
    board = {"validate_inputs": {}, "tool_overrides": {"write_file": {"input_schema": schema}}}
    checks = of_kind(run(tape, board), "input_check")
    assert checks[0]["valid"] is False
    assert "note" in checks[0]["reason"]


def test_the_schema_override_is_in_the_request() -> None:
    schema = {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}
    tape = make_tape(tools=["write_file"], script=[{"say": "done"}])
    board = {"tool_overrides": {"write_file": {"input_schema": schema}}}
    assert tools_of(requests(run(tape, board))[0])["write_file"]["input_schema"] == schema


def test_an_unknown_override_name_is_refused_before_any_event() -> None:
    tape = make_tape(tools=["write_file"], script=[{"say": "done"}])
    with pytest.raises(BoardError):
        run(tape, {"tool_overrides": {"read_file": {"description": "x"}}})


@pytest.mark.parametrize(
    "override",
    [{"color": "red"}, {"description": ""}, {}, {"input_schema": []}],
)
def test_override_shapes_are_refused(override: dict[str, Any]) -> None:
    with pytest.raises(BoardError):
        board_from_dict(
            {"id": "b", "label": "B", "modules": {"tool_overrides": {"write_file": override}}}
        )


def test_sent_lacks_sees_the_override_description() -> None:
    request = {
        "system": "s",
        "tools": [{"name": "write_file", "description": "Use edit_file for code."}],
        "messages": [],
    }
    ctx = CallContext(
        turn=1,
        t=0,
        messages=[],
        last_permission=None,
        last_truncated=False,
        feedback_pending=False,
        request=request,
    )
    assert not condition_holds("sent_lacks:Use edit_file", ctx)
    assert condition_holds("sent_lacks:Appends", ctx)
