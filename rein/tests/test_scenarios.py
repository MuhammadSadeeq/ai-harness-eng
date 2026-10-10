"""Every scenario tape runs to a status without crashing, and the outcomes the spec implies hold.

The scenario tapes exercise the lessons' mechanisms (overflow, interrupts, outages, false
done, approvals). They are read as inputs only; these tests assert behaviour, not golden files.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from support import BOARDS, FACTS_PATH, SCENARIOS, kinds, of_kind

from rein.board import load_board
from rein.sim import run_trial
from rein.spec import STATUSES
from rein.tape import load_tape

FACTS = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
TAPES = sorted(
    p
    for p in SCENARIOS.glob("*.json")
    if not p.name.endswith("schema.json") and p.name != "b2-spiral.json"
)


@pytest.mark.parametrize("tape_path", TAPES, ids=[p.stem for p in TAPES])
def test_every_board_and_seed_runs_to_a_known_status(tape_path: Path) -> None:
    tape = load_tape(tape_path)
    for board_id in tape.boards:
        board = load_board(BOARDS / f"{board_id}.json")
        for seed in tape.golden_seeds[:2]:
            trial = run_trial(tape, board, seed, FACTS)
            result = trial.result
            assert result.status in STATUSES
            assert kinds(result)[-1] == "run_end"
            assert [e["seq"] for e in trial.events] == list(range(len(trial.events)))


def status_of(name: str, board: str, seed: int = 1) -> str:
    tape = load_tape(SCENARIOS / f"{name}.json")
    return run_trial(tape, load_board(BOARDS / f"{board}.json"), seed, FACTS).result.status


def test_flood_on_the_old_board_overflows_the_window() -> None:
    # Amendment A1: the unbounded tool output pushes the prompt past the 8000-token window.
    assert status_of("c2-flood", "c2-old") == "error"
    trial = run_trial(
        load_tape(SCENARIOS / "c2-flood.json"),
        load_board(BOARDS / "c2-old.json"),
        1,
        FACTS,
    ).result
    assert of_kind(trial, "context_check")[-1]["action"] == "overflow"


def test_the_output_cap_keeps_the_flood_inside_the_window() -> None:
    assert status_of("c2-flood", "c2-new") == "done"


def test_resume_without_close_books_fails_and_with_it_completes() -> None:
    assert status_of("c5-interrupt", "c5-old") == "error"
    assert status_of("c5-interrupt", "c5-new") == "done"


def test_false_done_is_a_done_claim_that_did_not_pass() -> None:
    tape = load_tape(SCENARIOS / "s0-false-done.json")
    result = run_trial(tape, load_board(BOARDS / "s0-old.json"), 1, FACTS).result
    assert result.status == "done"
    assert result.passed is False
