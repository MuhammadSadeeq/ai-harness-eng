"""ENGINE.md A8.1, A8.3, A8.4 and A8.5: the rulings from building A6 and A7."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from support import make_tape, of_kind, run

from rein.sim import main as sim_main

LIST = [["list_files", {}]]


def _long_script() -> list[dict[str, Any]]:
    return [{"tools": LIST}, {"tools": LIST}, {"tools": LIST}, {"say": "done"}]


def test_a8_1_compaction_is_inert_with_resend_false_whatever_the_threshold() -> None:
    notes = [{"id": "n1", "kind": "goal", "turn": 0, "text": "Fix calc"}]
    tape = make_tape(script=_long_script(), notes=notes)
    board = {"history": {"resend": False}, "compaction": {"threshold_percent": 1, "keep": ["goal"]}}
    result = run(tape, board)
    assert of_kind(result, "compaction") == []
    assert all(event["action"] == "none" for event in of_kind(result, "context_check"))


def test_a8_3_a_partial_thinking_table_adds_zero_for_the_levels_it_leaves_out() -> None:
    table = {"low": 5, "max": 50}
    tape = make_tape(script=[{"say": "hi"}], effort={"default": "medium", "thinking_tokens": table})
    reply = of_kind(run(tape, {}), "model_reply")[0]
    assert reply["usage"]["output_tokens_details"] == {"thinking_tokens": 0}  # medium is not listed


def test_a8_3_the_default_is_optional() -> None:
    tape = make_tape(script=[{"say": "hi"}], effort={"thinking_tokens": {"high": 7}})
    reply = of_kind(run(tape, {}), "model_reply")[0]
    assert reply["usage"]["output_tokens_details"] == {"thinking_tokens": 7}  # the fallback is high


def test_a8_4_the_response_usage_has_the_fields_of_model_reply_usage() -> None:
    tape = make_tape(
        script=[{"say": "hi"}], effort={"default": "low", "thinking_tokens": {"low": 3}}
    )
    result = run(tape, {})
    reply = of_kind(result, "model_reply")[0]
    response = [entry for entry in result.wire if "id" in entry][0]
    assert response["usage"] == reply["usage"]
    assert response["usage"]["output_tokens_details"] == {"thinking_tokens": 3}


def test_a8_4_a_tape_without_effort_has_no_details_on_the_response() -> None:
    result = run(make_tape(script=[{"say": "hi"}]), {})
    response = [entry for entry in result.wire if "id" in entry][0]
    assert "output_tokens_details" not in response["usage"]


def test_a8_5_a_cache_board_without_cache_prices_is_refused_before_any_event(
    tmp_path: Path, capsys: Any
) -> None:
    tape_path = tmp_path / "tape.json"
    board_path = tmp_path / "board.json"
    tape = make_tape(script=[{"say": "hi"}])
    tape_path.write_text(json.dumps(tape.raw), encoding="utf-8")
    board_path.write_text(
        json.dumps({"id": "b", "label": "B", "modules": {"cache": {}}}), encoding="utf-8"
    )
    code = sim_main(["run", "--tape", str(tape_path), "--board", str(board_path), "--seed", "0"])
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert "cache" in captured.err
