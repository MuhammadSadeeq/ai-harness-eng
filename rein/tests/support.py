"""Shared test helpers: small tapes and boards built from one valid base."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from rein.board import Board, board_from_dict
from rein.harness import Harness, RunResult
from rein.pricing import resolve_prices
from rein.tape import Tape, tape_from_dict

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "scenarios"
BOARDS = SCENARIOS / "boards"
FACTS_PATH = ROOT / "site" / "data" / "facts.json"

BASE_TAPE: dict[str, Any] = {
    "id": "t-test",
    "schema": 1,
    "title": "test tape",
    "task": "do the task",
    "model_id": "claude-test-1",
    "pricing": {"input_milli_per_mtok": 1000, "output_milli_per_mtok": 2000},
    "window": 8000,
    "system": "You are a test agent.",
    "rules": [],
    "workspace": {"a.txt": "hello\n"},
    "outside": {},
    "tools": ["read_file", "edit_file", "run_command", "list_files", "write_file"],
    "custom_tools": [],
    "checks": [{"file": "a.txt", "contains": "hello"}],
    "test_output": {"pass": "2 passed", "fail": "1 failed"},
    "script": [{"say": "done", "stop": "end_turn"}],
    "human": {"default": "approve"},
    "interrupt": None,
    "boards": ["b"],
    "golden_seeds": [1],
    "seed_base": 0,
}


def make_tape(**changes: Any) -> Tape:
    data = copy.deepcopy(BASE_TAPE)
    data.update(changes)
    return tape_from_dict(data)


def make_board(modules: dict[str, Any] | None = None) -> Board:
    return board_from_dict({"id": "b", "label": "B", "modules": modules or {}})


def run(tape: Tape, modules: dict[str, Any] | None = None, seed: int = 1) -> RunResult:
    return Harness(tape, make_board(modules), seed, resolve_prices(tape.pricing, None)).run()


def kinds(result: RunResult) -> list[str]:
    return [event["kind"] for event in result.events]


def of_kind(result: RunResult, kind: str) -> list[dict[str, Any]]:
    return [event for event in result.events if event["kind"] == kind]


def load_facts() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    return data
