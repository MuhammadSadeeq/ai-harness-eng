"""ENGINE.md A5.1, A5.2, A5.5: history {"resend": false}, history_lt, missing results."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_board, make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import CallContext, condition_holds
from rein.tape import Tape

NO_RESEND = {"history": {"resend": False}}
LIST = [["list_files", {}]]


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def last_text(result: Any) -> str:
    return str(of_kind(result, "model_reply")[-1]["text"])


def two_calls() -> Tape:
    return make_tape(script=[{"tools": LIST}, {"say": "done"}])


def test_without_resend_each_request_carries_only_the_task() -> None:
    tape = two_calls()
    sent = requests(run(tape, NO_RESEND))
    assert len(sent) == 2
    for entry in sent:
        assert len(entry["messages"]) == 1
        assert entry["messages"][0]["content"][0]["text"] == tape.task


def test_with_resend_the_second_request_carries_the_whole_history() -> None:
    sent = requests(run(two_calls(), {}))
    assert [len(entry["messages"]) for entry in sent] == [1, 3]


def test_prompt_built_names_the_layer_that_is_not_sent() -> None:
    assert (
        of_kind(run(two_calls(), NO_RESEND), "prompt_built")[-1]["layers"][-1]
        == "history (not resent)"
    )
    assert of_kind(run(two_calls(), {}), "prompt_built")[-1]["layers"][-1] == "history"


def test_prompt_tokens_count_only_what_is_sent() -> None:
    sent = [event["tokens"] for event in of_kind(run(two_calls(), NO_RESEND), "prompt_built")]
    full = [event["tokens"] for event in of_kind(run(two_calls(), {}), "prompt_built")]
    assert sent[0] == full[0]
    assert sent[1] < full[1]


def test_the_harness_still_keeps_its_history_for_the_last_conditions() -> None:
    script: list[dict[str, Any]] = [
        {"tools": [["read_file", {"path": "missing.txt"}]]},
        {
            "when": [
                {"if": "last_result_error", "then": [{"say": "error seen"}]},
                {"else": [{"say": "no error"}]},
            ]
        },
    ]
    assert last_text(run(make_tape(script=script), NO_RESEND)) == "error seen"


def test_history_lt_counts_the_request_about_to_be_sent() -> None:
    script: list[dict[str, Any]] = [
        {"tools": LIST},
        {
            "when": [
                {"if": "history_lt:2", "then": [{"say": "fresh"}]},
                {"else": [{"say": "has history"}]},
            ]
        },
    ]
    assert last_text(run(make_tape(script=script), NO_RESEND)) == "fresh"
    assert last_text(run(make_tape(script=script), {})) == "has history"


def _context(
    messages: list[dict[str, Any]], sent: list[dict[str, Any]] | None = None
) -> CallContext:
    return CallContext(
        turn=1,
        t=0,
        messages=messages,
        last_permission=None,
        last_truncated=False,
        feedback_pending=False,
        sent=sent,
    )


def test_history_lt_reads_the_sent_messages_when_given() -> None:
    full: list[dict[str, Any]] = [{"role": "user", "content": []}] * 3
    assert not condition_holds("history_lt:2", _context(full))
    assert condition_holds("history_lt:2", _context(full, sent=full[:1]))
    assert condition_holds("history_lt:4", _context(full))
    assert not condition_holds("history_lt:3", _context(full))


@pytest.mark.parametrize("params", [{}, {"resend": "no"}, {"resend": 0}])
def test_history_needs_a_true_or_false_resend(params: dict[str, Any]) -> None:
    with pytest.raises(BoardError):
        board_from_dict({"id": "b", "label": "B", "modules": {"history": params}})


def test_history_with_resend_false_is_a_valid_board() -> None:
    assert make_board(NO_RESEND).has("history")


def test_history_resend_true_is_the_same_as_absent() -> None:
    tape = two_calls()
    assert requests(run(tape, {"history": {"resend": True}})) == requests(run(tape, {}))


@pytest.mark.parametrize(
    "params", [{"resend": False, "extra": True}, {"resend": "no"}, {"resend": 1}]
)
def test_history_refuses_any_other_shape(params: dict[str, Any]) -> None:
    with pytest.raises(BoardError):
        board_from_dict({"id": "b", "label": "B", "modules": {"history": params}})


def test_a_tool_result_must_sit_in_the_message_right_after_its_request() -> None:
    # A5.5(a): the result has to be in the user message right after the assistant message.
    from rein.model import missing_results

    task = {"role": "user", "content": [{"type": "text", "text": "task"}]}
    request = {
        "role": "assistant",
        "content": [{"type": "tool_use", "id": "t1", "name": "x", "input": {}}],
    }
    result = {
        "role": "user",
        "content": [
            {"type": "tool_result", "tool_use_id": "t1", "content": "ok", "is_error": False}
        ],
    }
    text = {"role": "user", "content": [{"type": "text", "text": "not yet"}]}
    # A7.2: the run of consecutive user messages after the request counts as the reply's answer.
    assert missing_results([task, request, text, result]) == []
    assistant = {"role": "assistant", "content": []}
    assert missing_results([task, request, assistant, result]) == ["t1"]
    assert missing_results([task, request, result]) == []
    assert missing_results([task, request]) == ["t1"]
