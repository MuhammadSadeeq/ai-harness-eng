"""The engine tapes (ENGINE.md A8.6): each shows its amendment's features, on every seed."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from support import FACTS_PATH, of_kind

from rein.board import load_board
from rein.sim import run_trial
from rein.spec import STATUSES
from rein.tape import load_tape

ENGINE = Path(__file__).resolve().parents[2] / "scenarios" / "engine"
ENGINE_BOARDS = ENGINE / "boards"
FACTS = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
TAPES = sorted(ENGINE.glob("*.json"))
CASES = [
    (tape_path, board_id, seed)
    for tape_path in TAPES
    for board_id in load_tape(tape_path).boards
    for seed in load_tape(tape_path).golden_seeds
]


def trial(tape_id: str, board_id: str, seed: int) -> Any:
    tape = load_tape(ENGINE / f"{tape_id}.json")
    return run_trial(tape, load_board(ENGINE_BOARDS / f"{board_id}.json"), seed, FACTS).result


def texts(result: Any) -> list[str]:
    return [str(event["text"]) for event in of_kind(result, "model_reply")]


@pytest.mark.parametrize(
    ("tape_path", "board_id", "seed"), CASES, ids=lambda v: getattr(v, "stem", str(v))
)
def test_every_engine_run_ends_with_a_known_status(
    tape_path: Path, board_id: str, seed: int
) -> None:
    result = trial(tape_path.stem, board_id, seed)
    assert result.status in STATUSES
    assert result.turns >= 1


def test_compaction_keeps_the_kinds_each_board_keeps() -> None:
    all_kinds = trial("eng-compaction", "eng-compaction-keep-all", 0)
    progress = trial("eng-compaction", "eng-compaction-keep-progress", 0)
    kept_all = {note for event in of_kind(all_kinds, "compaction") for note in event["kept_notes"]}
    kept_progress = {
        note for event in of_kind(progress, "compaction") for note in event["kept_notes"]
    }
    # n5 is written at turn 4, so the compaction at turn 5 is the first that knows it.
    assert kept_all == {"n1", "n2", "n3", "n4", "n5"}
    assert kept_progress == {"n2", "n5"}  # the progress notes only


def test_resend_off_makes_compaction_inert_and_sent_lacks_sees_it() -> None:
    result = trial("eng-compaction", "eng-compaction-resend-off", 0)
    assert of_kind(result, "compaction") == []
    assert "I have no summary yet." in texts(result)
    summarised = trial("eng-compaction", "eng-compaction-keep-all", 0)
    assert "I have a summary of the work so far." in texts(summarised)


def test_the_context_condition_reads_the_prompt_against_the_window() -> None:
    assert "The context is past 3 percent." in texts(
        trial("eng-compaction", "eng-compaction-keep-all", 0)
    )
    assert "The context is still small." in texts(
        trial("eng-compaction", "eng-compaction-resend-off", 0)
    )


def test_a_plain_cache_reads_and_the_clock_board_never_does() -> None:
    plain = [e for e in of_kind(trial("eng-cache-clock", "eng-cache-plain", 0), "cache")]
    clock = [e for e in of_kind(trial("eng-cache-clock", "eng-cache-clock", 0), "cache")]
    assert plain[0]["read"] == 0 and all(event["read"] > 0 for event in plain[1:])
    assert all(event["read"] == 0 for event in clock)


def test_an_expired_entry_is_not_read() -> None:
    cache = of_kind(trial("eng-cache-ttl", "eng-cache-ttl", 0), "cache")
    assert [event["read"] > 0 for event in cache] == [False, True, False, True]


def test_below_the_minimum_nothing_is_cached() -> None:
    cache = of_kind(trial("eng-cache-short", "eng-cache-short", 0), "cache")
    assert all(e["read"] == 0 and e["write"] == 0 and e["matched"] == "none" for e in cache)
    assert all(e["uncached"] > 0 and e["hit_percent"] == 0 for e in cache)


def test_compaction_breaks_the_prefix_so_the_compacted_call_reads_nothing() -> None:
    cache = of_kind(trial("eng-cache-compaction", "eng-cache-compaction", 0), "cache")
    compacted = [
        event
        for event in of_kind(
            trial("eng-cache-compaction", "eng-cache-compaction", 0), "context_check"
        )
        if event["action"] == "compacted"
    ]
    assert compacted
    assert (
        cache[2]["read"] == 0 and cache[2]["write"] > 0
    )  # the third call follows the first compaction


def test_each_input_reason_is_named_and_the_trusting_board_runs_everything() -> None:
    checked = of_kind(trial("eng-validate", "eng-validate-checked", 0), "input_check")
    assert [(e["valid"], e["reason"]) for e in checked] == [
        (False, "missing required field: id"),
        (False, "field id must be integer"),
        (False, "unknown field: zz"),
        (False, 'field mode must be one of: "fast", "slow"'),
        (True, ""),
    ]
    trusting = trial("eng-validate", "eng-validate-trusting", 0)
    assert of_kind(trusting, "input_check") == []
    assert len(of_kind(trusting, "tool_call")) == 5


def test_split_results_send_one_message_each_and_the_condition_sees_it() -> None:
    assert "The results came in separate messages." in texts(
        trial("eng-split", "eng-split-split", 0)
    )
    assert "The results came in one message." in texts(trial("eng-split", "eng-split-joined", 0))


def test_the_effort_levels_set_the_thinking_tokens() -> None:
    def thinking(board: str) -> list[int]:
        return [
            e["usage"]["output_tokens_details"]["thinking_tokens"]
            for e in of_kind(trial("eng-effort", board, 0), "model_reply")
        ]

    assert set(thinking("eng-effort-default")) == {5}  # the tape default, low
    assert set(thinking("eng-effort-low")) == {5}  # the board names low explicitly
    assert set(thinking("eng-effort-max")) == {50}  # the board's level
    assert set(thinking("eng-effort-high")) == {0}  # high is not in the partial table
    assert "High effort: I read the file." in texts(trial("eng-effort", "eng-effort-max", 0))
    assert "Lower effort: I read the notes." in texts(trial("eng-effort", "eng-effort-default", 0))
