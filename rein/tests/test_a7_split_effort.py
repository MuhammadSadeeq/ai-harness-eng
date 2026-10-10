"""ENGINE.md A7.2 and A7.3: split_results and the results_split condition, and the effort block."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_board, make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import CallContext, condition_holds
from rein.tape import TapeError
from rein.tokens import tokens

TWO_READS: dict[str, Any] = {"tools": [["list_files", {}], ["list_files", {}]]}
SPLIT_TAPE = [
    TWO_READS,
    {
        "when": [
            {"if": "results_split", "then": [{"say": "split seen"}]},
            {"else": [{"say": "one message"}]},
        ]
    },
]
THINK = {"low": 10, "medium": 20, "high": 30, "xhigh": 40, "max": 50}


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def texts(result: Any) -> list[str]:
    return [str(event["text"]) for event in of_kind(result, "model_reply")]


def test_split_results_send_one_user_message_per_result() -> None:
    result = run(make_tape(script=SPLIT_TAPE), {"split_results": {}})
    second = requests(result)[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "user", "user"]
    assert len(second[2]["content"]) == 1 and len(second[3]["content"]) == 1


def test_split_results_are_not_a_missing_result_error() -> None:
    result = run(make_tape(script=SPLIT_TAPE), {"split_results": {}})
    assert result.status == "done"
    assert texts(result)[-1] == "split seen"


def test_one_message_for_all_results_is_the_default() -> None:
    result = run(make_tape(script=SPLIT_TAPE), {})
    assert [m["role"] for m in requests(result)[1]["messages"]] == ["user", "assistant", "user"]
    assert texts(result)[-1] == "one message"


def test_results_split_reads_two_user_messages_in_a_row() -> None:
    split = [{"role": "user", "content": []}, {"role": "user", "content": []}]
    one = [{"role": "user", "content": []}, {"role": "assistant", "content": []}]
    ctx = CallContext(
        turn=1,
        t=0,
        messages=split,
        last_permission=None,
        last_truncated=False,
        feedback_pending=False,
        sent=split,
    )
    assert condition_holds("results_split", ctx)
    assert not condition_holds(
        "results_split",
        CallContext(
            turn=1,
            t=0,
            messages=one,
            last_permission=None,
            last_truncated=False,
            feedback_pending=False,
            sent=one,
        ),
    )


def test_effort_gte_compares_the_level_in_force_with_the_default_and_the_board() -> None:
    script = [
        {
            "when": [
                {"if": "effort_gte:high", "then": [{"say": "high"}]},
                {"else": [{"say": "lower"}]},
            ]
        }
    ]
    tape = make_tape(script=script, effort={"default": "medium"})
    assert texts(run(tape, {}))[-1] == "lower"
    assert texts(run(tape, {"effort": {"level": "xhigh"}}))[-1] == "high"


def test_the_level_in_force_is_the_board_then_the_tape_then_high() -> None:
    script = [
        {"when": [{"if": "effort_gte:high", "then": [{"say": "yes"}]}, {"else": [{"say": "no"}]}]}
    ]
    assert texts(run(make_tape(script=script), {}))[-1] == "yes"  # no tape default: high


def test_thinking_tokens_add_to_the_output_and_to_the_latency() -> None:
    tape = make_tape(script=[{"say": "hi"}], effort={"default": "low", "thinking_tokens": THINK})
    result = run(tape, {})
    reply = of_kind(result, "model_reply")[0]
    assert reply["usage"]["output_tokens_details"] == {"thinking_tokens": 10}
    assert reply["usage"]["output_tokens"] == tokens([{"type": "text", "text": "hi"}]) + 10
    recovery = of_kind(result, "recovery_check")[0]
    assert reply["t"] - recovery["t"] == 600 + 20 * reply["usage"]["output_tokens"]


def test_the_board_level_selects_the_thinking_tokens() -> None:
    tape = make_tape(script=[{"say": "hi"}], effort={"default": "low", "thinking_tokens": THINK})
    reply = of_kind(run(tape, {"effort": {"level": "max"}}), "model_reply")[0]
    assert reply["usage"]["output_tokens_details"] == {"thinking_tokens": 50}


def test_no_effort_block_means_no_thinking_details() -> None:
    reply = of_kind(run(make_tape(script=[{"say": "hi"}]), {}), "model_reply")[0]
    assert "output_tokens_details" not in reply["usage"]


def test_the_cost_counts_the_thinking_as_output() -> None:
    tape = make_tape(script=[{"say": "hi"}], effort={"default": "low", "thinking_tokens": THINK})
    result = run(tape, {})
    reply = of_kind(result, "model_reply")[0]
    prompt = of_kind(result, "prompt_built")[0]["tokens"]
    assert (
        of_kind(result, "run_end")[0]["cost"]
        == prompt * 1000 + reply["usage"]["output_tokens"] * 2000
    )


def test_the_board_effort_sets_output_config_on_the_wire() -> None:
    tape = make_tape(script=[{"say": "hi"}])
    assert requests(run(tape, {"effort": {"level": "xhigh"}}))[0]["output_config"] == {
        "effort": "xhigh"
    }
    assert "output_config" not in requests(run(tape, {}))[0]


def test_the_loader_refuses_a_bad_effort_block() -> None:
    with pytest.raises(TapeError):
        make_tape(effort={"default": "extreme"})
    with pytest.raises(TapeError):
        make_tape(effort={"thinking_tokens": {"extreme": 1}})


def test_the_board_refuses_an_unknown_level() -> None:
    with pytest.raises(BoardError):
        board_from_dict({"id": "b", "label": "B", "modules": {"effort": {"level": "extreme"}}})
    assert make_board({"effort": {"level": "max"}}).has("effort")
