"""Tapes, boards and pricing: loading, the rules the engine depends on, and fact resolution."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
from support import BASE_TAPE, BOARDS, FACTS_PATH, SCENARIOS, load_facts, make_tape

from rein.board import BoardError, board_from_dict, load_board
from rein.pricing import PricingError, resolve_prices, usd_to_milli
from rein.tape import TapeError, load_tape, tape_from_dict


def test_dev_tape_loads_with_its_fields() -> None:
    tape = load_tape(SCENARIOS / "b2-spiral.json")
    assert tape.id == "b2-spiral"
    assert tape.window == 8000
    assert tape.boards == ["b2-old", "b2-new"]
    assert tape.golden_seeds == [0, 1, 2]  # D-042
    assert tape.seed_base == 20261010


@pytest.mark.parametrize("board", ["b2-old", "b2-new"])
def test_dev_boards_load(board: str) -> None:
    assert load_board(BOARDS / f"{board}.json").id == board


def test_branch_percents_must_sum_to_100() -> None:
    script = [{"branch": [{"percent": 60, "then": []}, {"percent": 30, "then": []}]}]
    with pytest.raises(TapeError, match="sum to 100"):
        make_tape(script=script)


def test_unknown_builtin_tool_is_rejected() -> None:
    with pytest.raises(TapeError, match="unknown built-in tool"):
        make_tape(tools=["read_file", "rm_rf"])


def test_custom_tool_may_not_shadow_a_builtin() -> None:
    custom = {
        "name": "read_file",
        "description": "x",
        "input_schema": {"type": "object"},
        "latency_ms": 1,
        "results": [],
        "default": {"output": "x", "ok": False},
    }
    with pytest.raises(TapeError, match="must not be built-in"):
        make_tape(custom_tools=[custom])


def test_schema_version_must_be_one() -> None:
    raw = copy.deepcopy(BASE_TAPE)
    raw["schema"] = 2
    with pytest.raises(TapeError, match="schema must be 1"):
        tape_from_dict(raw)


def test_window_must_be_positive_integer() -> None:
    with pytest.raises(TapeError, match="window"):
        make_tape(window=0)


def test_human_default_is_checked() -> None:
    with pytest.raises(TapeError, match="human.default"):
        make_tape(human={"default": "maybe"})


def test_board_rejects_unknown_module_and_bad_params() -> None:
    with pytest.raises(BoardError, match="unknown module"):
        board_from_dict({"id": "b", "label": "B", "modules": {"magic": {}}})
    with pytest.raises(BoardError, match="max_turns"):
        board_from_dict({"id": "b", "label": "B", "modules": {"turn_limit": {"max_turns": 0}}})
    with pytest.raises(BoardError, match="jitter"):
        board_from_dict(
            {
                "id": "b",
                "label": "B",
                "modules": {"retry": {"max_attempts": 2, "base_ms": 1, "cap_ms": 9, "jitter": "x"}},
            }
        )


def test_usd_per_mtok_rounds_half_up_to_milli() -> None:
    assert usd_to_milli(2) == 2000
    assert usd_to_milli(0.1) == 100
    assert usd_to_milli(0.0005) == 1  # 0.5 rounds up, as JS Math.round does
    assert usd_to_milli(0.0004) == 0


def test_fact_pricing_resolves_from_the_registry() -> None:
    prices = resolve_prices({"fact": "models.sonnet-5-5-price"}, load_facts())
    assert (prices.input_milli, prices.output_milli) == (2000, 10000)
    assert FACTS_PATH.is_file()


def test_fact_pricing_needs_the_registry_and_the_fact() -> None:
    with pytest.raises(PricingError, match="--facts"):
        resolve_prices({"fact": "models.sonnet-5-5-price"}, None)
    with pytest.raises(PricingError, match="no value"):
        resolve_prices({"fact": "no.such"}, load_facts())


def test_inline_pricing_is_used_as_given() -> None:
    prices = resolve_prices({"input_milli_per_mtok": 3000, "output_milli_per_mtok": 15000}, None)
    assert (prices.input_milli, prices.output_milli) == (3000, 15000)


def test_tape_path_loader_reports_a_bad_file(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text('{"id": "x", "value": 1.5}', encoding="utf-8")
    with pytest.raises(TapeError, match="integers only"):
        load_tape(bad)
