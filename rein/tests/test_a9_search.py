"""ENGINE.md A9.2: tools on demand: tool_search, tools_gte and tool_loaded."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import CallContext, condition_holds
from rein.tape import TapeError


def tool(name: str, description: str) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "additionalProperties": False,
        },
        "latency_ms": 100,
        "results": [],
        "default": {"output": "ok", "ok": True},
    }


LINT = tool("lint_file", "Lint a Python file for style problems.")
FORMAT = tool("format_file", "Format a Python file in place.")
COUNT = tool("count_lines", "Count the lines in a file.")
SEARCH = {"tool_search": {"always": ["read_file"]}}


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def names(entry: dict[str, Any]) -> list[str]:
    return [tool["name"] for tool in entry["tools"]]


def search(query: str) -> dict[str, Any]:
    return {"say": "Searching.", "tools": [["tool_search", {"query": query}]]}


def tool_results(result: Any, name: str) -> list[tuple[str, bool]]:
    return [
        (str(e["output"]), bool(e["ok"])) for e in of_kind(result, "tool_call") if e["tool"] == name
    ]


def test_the_request_holds_the_always_tools_then_the_loaded_then_tool_search() -> None:
    tape = make_tape(
        tools=["read_file", "list_files"],
        custom_tools=[LINT, COUNT],
        script=[search("lint"), {"say": "done"}],
    )
    sent = requests(run(tape, SEARCH))
    assert names(sent[0]) == ["read_file", "tool_search"]
    assert names(sent[1]) == ["read_file", "lint_file", "tool_search"]


def test_a_search_loads_at_most_five_tools_in_definition_order() -> None:
    helpers = [tool(f"helper_{n}", "A helper tool.") for n in range(7)]
    tape = make_tape(
        custom_tools=helpers, tools=["read_file"], script=[search("helper"), {"say": "done"}]
    )
    sent = requests(run(tape, {"tool_search": {"always": ["read_file"]}}))
    loaded = [name for name in names(sent[1]) if name.startswith("helper_")]
    assert loaded == ["helper_0", "helper_1", "helper_2", "helper_3", "helper_4"]


def test_every_word_must_match_without_regard_to_case() -> None:
    tape = make_tape(
        custom_tools=[LINT, FORMAT],
        tools=["read_file"],
        script=[search("LINT PYTHON"), {"say": "done"}],
    )
    assert of_kind(run(tape, SEARCH), "tool_call")[0]["output"] == "Loaded: lint_file"
    tape = make_tape(
        custom_tools=[LINT, FORMAT],
        tools=["read_file"],
        script=[search("lint cake"), {"say": "done"}],
    )
    assert of_kind(run(tape, SEARCH), "tool_call")[0]["output"] == "No tool matched: lint cake"


def test_a_no_match_search_is_an_error_result() -> None:
    tape = make_tape(
        custom_tools=[LINT], tools=["read_file"], script=[search("bake cake"), {"say": "done"}]
    )
    call = of_kind(run(tape, SEARCH), "tool_call")[0]
    assert call["ok"] is False
    assert call["output"] == "No tool matched: bake cake"


def test_a_call_to_an_unloaded_tool_runs_and_its_definition_is_never_sent() -> None:
    script = [{"say": "Counting.", "tools": [["count_lines", {"path": "a.txt"}]]}, {"say": "done"}]
    tape = make_tape(custom_tools=[COUNT], tools=["read_file"], script=script)
    result = run(tape, SEARCH)
    assert [event["tool"] for event in of_kind(result, "tool_call")] == ["count_lines"]
    assert all("count_lines" not in names(entry) for entry in requests(result))


def test_the_search_call_takes_one_hundred_milliseconds() -> None:
    tape = make_tape(
        custom_tools=[LINT], tools=["read_file"], script=[search("lint"), {"say": "done"}]
    )
    result = run(tape, SEARCH)
    reply = of_kind(result, "model_reply")[0]
    call = of_kind(result, "tool_call")[0]
    assert call["t"] - reply["t"] == 100


def test_without_the_module_every_tool_is_sent_and_tool_search_is_unknown() -> None:
    tape = make_tape(
        custom_tools=[LINT], tools=["read_file"], script=[search("lint"), {"say": "done"}]
    )
    result = run(tape, {})
    assert all("tool_search" not in names(entry) for entry in requests(result))
    assert names(requests(result)[0]) == ["read_file", "lint_file"]


def test_the_always_names_must_be_tools_of_the_tape() -> None:
    tape = make_tape(tools=["read_file"], script=[{"say": "done"}])
    with pytest.raises(BoardError):
        run(tape, {"tool_search": {"always": ["write_file"]}})


def test_always_must_be_a_list_of_distinct_names() -> None:
    with pytest.raises(BoardError):
        board_from_dict(
            {"id": "b", "label": "B", "modules": {"tool_search": {"always": ["a", "a"]}}}
        )


def test_tools_gte_and_tool_loaded_read_the_request_about_to_be_sent() -> None:
    request = {
        "system": "s",
        "tools": [{"name": "read_file"}, {"name": "lint_file"}],
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
    assert condition_holds("tools_gte:2", ctx)
    assert not condition_holds("tools_gte:3", ctx)
    assert condition_holds("tool_loaded:lint_file", ctx)
    assert not condition_holds("tool_loaded:count_lines", ctx)


def test_the_loader_refuses_bad_arguments_of_the_new_conditions() -> None:
    for condition in ["tools_gte:-1", "tools_gte:x", "tool_loaded:"]:
        script = [{"when": [{"if": condition, "then": [{"say": "x"}]}, {"else": [{"say": "y"}]}]}]
        with pytest.raises(TapeError):
            make_tape(script=script)


def test_an_empty_or_blank_query_loads_nothing() -> None:
    for query in ["", "   "]:
        tape = make_tape(
            custom_tools=[LINT], tools=["read_file"], script=[search(query), {"say": "done"}]
        )
        result = run(tape, SEARCH)
        assert tool_results(result, "tool_search") == [(f"No tool matched: {query}", False)]
        assert names(requests(result)[1]) == ["read_file", "tool_search"]


def test_a_match_already_loaded_says_so_and_loads_nothing() -> None:
    tape = make_tape(
        custom_tools=[LINT],
        tools=["read_file"],
        script=[search("lint"), search("lint"), {"say": "done"}],
    )
    assert tool_results(run(tape, SEARCH), "tool_search") == [
        ("Loaded: lint_file", True),
        ("Already loaded: lint_file", True),
    ]


def test_an_always_tool_counts_as_loaded() -> None:
    tape = make_tape(
        custom_tools=[LINT], tools=["read_file"], script=[search("read"), {"say": "done"}]
    )
    assert tool_results(run(tape, SEARCH), "tool_search") == [("Already loaded: read_file", True)]


def test_always_tools_are_sent_in_a31_order_not_list_order() -> None:
    tape = make_tape(tools=["read_file", "list_files"], script=[{"say": "done"}])
    plain = [tool["name"] for tool in requests(run(tape, {}))[0]["tools"]]
    listed = [
        tool["name"]
        for tool in requests(run(tape, {"tool_search": {"always": ["list_files", "read_file"]}}))[
            0
        ]["tools"]
    ]
    assert listed == [name for name in plain if name in {"read_file", "list_files"}] + [
        "tool_search"
    ]


def test_tools_gte_counts_the_tool_search_definition() -> None:
    script = [
        {
            "when": [
                {"if": "tools_gte:2", "then": [{"say": "counted"}]},
                {"else": [{"say": "not counted"}]},
            ]
        }
    ]
    tape = make_tape(tools=["read_file"], script=script)
    assert [e["text"] for e in of_kind(run(tape, SEARCH), "model_reply")] == ["counted"]


def test_the_tape_cannot_define_its_own_tool_search() -> None:
    tape = make_tape(
        custom_tools=[tool("tool_search", "A tool of its own.")],
        tools=["read_file"],
        script=[{"say": "done"}],
    )
    with pytest.raises(BoardError):
        run(tape, SEARCH)


def test_only_unloaded_matches_load_when_some_matches_are_loaded() -> None:
    script = [search("lint"), search("file"), {"say": "done"}]
    tape = make_tape(custom_tools=[LINT, FORMAT, COUNT], tools=["read_file"], script=script)
    assert tool_results(run(tape, SEARCH), "tool_search") == [
        ("Loaded: lint_file", True),
        ("Loaded: format_file, count_lines", True),
    ]


def test_already_loaded_lists_every_match_with_no_cap() -> None:
    helpers = [tool(f"helper_{n}", "A helper tool.") for n in range(7)]
    script = [search("helper"), search("helper"), search("helper"), {"say": "done"}]
    tape = make_tape(custom_tools=helpers, tools=["read_file"], script=script)
    outputs = tool_results(run(tape, SEARCH), "tool_search")
    assert outputs[0] == ("Loaded: helper_0, helper_1, helper_2, helper_3, helper_4", True)
    assert outputs[1] == ("Loaded: helper_5, helper_6", True)
    assert outputs[2] == ("Already loaded: " + ", ".join(f"helper_{n}" for n in range(7)), True)
