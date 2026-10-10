"""ENGINE.md A6.1 to A6.4 and A6.7: notes, the compactor, two conditions, the clock."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import CallContext, condition_holds
from rein.tape import TapeError, tape_from_dict

LIST = [["list_files", {}]]
NOTES = [
    {"id": "n1", "kind": "goal", "turn": 0, "text": "Fix calc"},
    {"id": "n2", "kind": "progress", "turn": 1, "text": "Read calc.py"},
    {"id": "n3", "kind": "file", "turn": 1, "text": "calc.py"},
]


def long_run() -> list[dict[str, Any]]:
    # Five messages after two tool turns, so the third turn sees a user message last.
    return [{"tools": LIST}, {"tools": LIST}, {"tools": LIST}, {"say": "done"}]


def compaction_board(keep: list[str], percent: int = 1) -> dict[str, Any]:
    return {"compaction": {"threshold_percent": percent, "keep": keep}}


def requests(result: Any) -> list[dict[str, Any]]:
    return [entry for entry in result.wire if "messages" in entry]


def test_compaction_keeps_the_notes_of_the_kinds_it_keeps() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), compaction_board(["goal", "file"]))
    event = of_kind(result, "compaction")[0]  # the first compaction; the next turn compacts again
    assert event["kept_notes"] == ["n1", "n3"]
    assert event["dropped_messages"] == 3
    assert event["tokens_after"] < event["tokens_before"]
    assert event["wire"] == "context"


def test_the_summary_lists_the_kept_notes_in_tape_order() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), compaction_board(["goal", "file"]))
    after = requests(result)[-1]["messages"][0]["content"][0]["text"]
    assert after == "Summary of the work so far:\n- goal: Fix calc\n- file: calc.py"


def test_an_empty_keep_list_says_nothing_was_kept() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), compaction_board([]))
    assert of_kind(result, "compaction")[0]["kept_notes"] == []
    after = requests(result)[-1]["messages"][0]["content"][0]["text"]
    assert after.endswith("\n- (nothing kept)")


def test_the_context_check_says_compacted_on_the_compaction_turn() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), compaction_board(["goal"]))
    actions = [event["action"] for event in of_kind(result, "context_check")]
    # Compaction runs each turn that qualifies: the history is back at five messages on turn 4.
    assert actions == ["none", "none", "compacted", "compacted"]


def test_no_compaction_before_five_messages_or_after_an_assistant_message() -> None:
    short = run(
        make_tape(script=[{"tools": LIST}, {"say": "done"}], notes=NOTES),
        compaction_board(["goal"]),
    )
    assert of_kind(short, "compaction") == []


def test_a_compaction_below_the_threshold_does_not_run() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), compaction_board(["goal"], percent=100))
    assert of_kind(result, "compaction") == []


def test_notes_with_a_duplicate_id_or_an_unknown_kind_are_refused() -> None:
    duplicate = [NOTES[0], dict(NOTES[0], text="again")]
    with pytest.raises(TapeError):
        tape_from_dict(make_tape().raw | {"notes": duplicate})
    with pytest.raises(TapeError):
        tape_from_dict(make_tape().raw | {"notes": [dict(NOTES[0], kind="mood")]})


def test_compaction_board_parameters_are_checked() -> None:
    with pytest.raises(BoardError):
        board_from_dict({"id": "b", "label": "B", "modules": compaction_board(["goal"], percent=0)})
    with pytest.raises(BoardError):
        board_from_dict(
            {
                "id": "b",
                "label": "B",
                "modules": {"compaction": {"threshold_percent": 5, "keep": ["mood"]}},
            }
        )


def _context(**changes: Any) -> CallContext:
    base: dict[str, Any] = {
        "turn": 1,
        "t": 0,
        "messages": [],
        "last_permission": None,
        "last_truncated": False,
        "feedback_pending": False,
        "sent": None,
        "request": None,
        "prompt_tokens": 500,
        "window": 8000,
        "level": "high",
        "thinking": 0,
    }
    base.update(changes)
    return CallContext(**base)


def test_context_gte_compares_the_prompt_with_the_window() -> None:
    # 100 * tokens >= n * window
    assert condition_holds("context_gte:5", _context(prompt_tokens=500, window=8000))
    assert not condition_holds("context_gte:100", _context(prompt_tokens=500, window=8000))


def test_sent_lacks_reads_string_values_not_keys() -> None:
    request = {
        "system": "You are a test agent.",
        "tools": [],
        "messages": [{"role": "user", "content": []}],
    }
    ctx = _context(request=request)
    assert not condition_holds("sent_lacks:test", ctx)
    assert condition_holds("sent_lacks:zebra", ctx)
    assert condition_holds("sent_lacks:messages", ctx)  # a key, not a value
    assert not condition_holds("sent_lacks:test agent.", ctx)  # the text may hold spaces and dots


def test_the_loader_refuses_bad_arguments_of_the_new_conditions() -> None:
    for condition in [
        "context_gte:01",
        "context_gte:-1",
        "context_gte:x",
        "sent_lacks:",
        "effort_gte:bogus",
    ]:
        script = [{"when": [{"if": condition, "then": [{"say": "x"}]}, {"else": [{"say": "y"}]}]}]
        with pytest.raises(TapeError):
            make_tape(script=script)


def test_the_system_clock_puts_the_time_at_the_top_of_each_prompt() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), {"system_clock": {}})
    prompts = of_kind(result, "prompt_built")
    assert all(event["layers"][0] == "clock" for event in prompts)
    for event, entry in zip(prompts, requests(result), strict=True):
        assert entry["system"].startswith(f"Current time: t={event['t']} ms\n\n")


def test_without_the_clock_the_system_prompt_is_as_written() -> None:
    result = run(make_tape(script=long_run(), notes=NOTES), {})
    assert requests(result)[0]["system"] == make_tape().system
    assert of_kind(result, "prompt_built")[0]["layers"][0] == "system"


def test_compaction_stays_off_under_resend_false_with_a_high_threshold() -> None:
    # A5 ruling in A6.7: the request holds the task only, so a sensible threshold never fires.
    result = run(
        make_tape(script=long_run(), notes=NOTES),
        {"history": {"resend": False}, **compaction_board(["goal"], 100)},
    )
    assert of_kind(result, "compaction") == []
