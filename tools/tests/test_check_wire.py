"""check_wire: the live Rein wire payloads against the anthropic types, with deliberately bad
payloads (A3.23: no golden files are read; D-019)."""

from __future__ import annotations

import copy
import importlib
import json
import shutil
import sys
from functools import cache
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "rein" / "src"))

cw: Any = importlib.import_module("check_wire")
load_board = importlib.import_module("rein.board").load_board
run_trial = importlib.import_module("rein.sim").run_trial
load_tape = importlib.import_module("rein.tape").load_tape
trace_line = importlib.import_module("rein.pyjson").trace_line

SCENARIOS = ROOT / "scenarios"
FACTS = ROOT / "site" / "data" / "facts.json"


@cache
def _wire() -> tuple[dict[str, Any], ...]:
    tape = load_tape(SCENARIOS / "b2-spiral.json")
    board = load_board(SCENARIOS / "boards" / "b2-old.json")
    facts: Any = json.loads(FACTS.read_text(encoding="utf-8"))
    return tuple(run_trial(tape, board, 0, facts).wire)


def good_pair() -> tuple[dict[str, Any], dict[str, Any]]:
    """The second turn: its request carries a tool_result (messages[2]); then its response."""
    wire = _wire()
    return wire[2], wire[3]


def problems_of(*payloads: dict[str, Any]) -> list[str]:
    report = cw.Report()
    cw.check_lines([trace_line(p) for p in payloads], "test", report)
    return [p.message for p in report.problems]


def test_live_payloads_pass() -> None:
    request, response = good_pair()
    report = cw.Report()
    cw.check_lines([trace_line(request), trace_line(response)], "test", report)
    assert report.problems == []
    assert report.payloads == 2


def test_the_later_turns_of_a_live_run_pass() -> None:
    report = cw.Report()
    cw.check_lines([trace_line(p) for p in _wire()], "live", report)
    assert report.problems == [], report.problems[:3]


def test_missing_tool_use_id_is_rejected() -> None:
    request, _ = good_pair()
    bad = copy.deepcopy(request)
    del bad["messages"][2]["content"][0]["tool_use_id"]
    assert any("missing key 'tool_use_id'" in m for m in problems_of(bad))


def test_unknown_block_key_is_rejected() -> None:
    request, _ = good_pair()
    bad = copy.deepcopy(request)
    bad["messages"][0]["content"][0]["foo"] = "bar"
    assert any("unknown key 'foo'" in m for m in problems_of(bad))


def test_wrong_stop_reason_is_rejected() -> None:
    _, response = good_pair()
    bad = copy.deepcopy(response)
    bad["stop_reason"] = "stop"
    assert any("stop_reason" in m for m in problems_of(bad))


def test_unknown_response_key_is_rejected() -> None:
    _, response = good_pair()
    bad = copy.deepcopy(response)
    bad["surprise"] = 1
    assert any("unknown key 'surprise'" in m for m in problems_of(bad))


def test_unknown_response_block_key_is_rejected() -> None:
    _, response = good_pair()
    bad = copy.deepcopy(response)
    bad["content"][0]["extra"] = 1
    assert any("unknown key 'extra'" in m for m in problems_of(bad))


def test_not_json_is_reported() -> None:
    report = cw.Report()
    cw.check_lines(["{not json"], "test", report)
    assert any("not valid JSON" in p.message for p in report.problems)


def test_a_request_without_messages_is_rejected() -> None:
    request, _ = good_pair()
    bad = copy.deepcopy(request)
    del bad["messages"]
    assert any("missing key 'messages'" in m for m in problems_of(bad))


def test_the_golden_directory_is_not_read(tmp_path: Path) -> None:
    """A3.23: a broken or absent golden file has no effect on check_wire."""
    scen = tmp_path / "scenarios"
    (scen / "boards").mkdir(parents=True)
    shutil.copy(SCENARIOS / "boards" / "b2-old.json", scen / "boards" / "b2-old.json")
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["golden_seeds"] = [0]
    raw["boards"] = ["b2-old"]
    (scen / "b2-spiral.json").write_text(json.dumps(raw), encoding="utf-8")
    golden = scen / "golden"
    golden.mkdir()
    (golden / "b2-spiral.b2-old.0.wire.jsonl").write_text("{not json\n", encoding="utf-8")
    report = cw.check(scen, FACTS)
    assert report.problems == []
    assert report.payloads == len(_wire())


def test_main_reports_the_payload_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cw,
        "live_wire",
        lambda scen, facts: iter([("t", [trace_line(p) for p in _wire()], frozenset())]),
    )
    assert cw.main(["--scenarios", str(tmp_path), "--facts", str(FACTS)]) == 0
    assert capsys.readouterr().out.strip() == f"check_wire: {len(_wire())} payloads OK"


def test_main_fails_on_a_bad_live_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _, response = good_pair()
    bad = dict(response, stop_reason="stop")
    monkeypatch.setattr(
        cw, "live_wire", lambda scen, facts: iter([("t", [trace_line(bad)], frozenset())])
    )
    assert cw.main(["--scenarios", str(tmp_path), "--facts", str(FACTS)]) == 1
    assert capsys.readouterr().out.strip().splitlines()[-1] == "check_wire: FAILED (1 problems)"


def test_a_key_the_board_sends_on_purpose_is_allowed_and_only_that_one() -> None:
    """A14.5: request_params put a parameter on the wire on purpose (F7: a removed one)."""
    payload = {**_wire()[0], "temperature": 1}
    assert cw.payload_problems(trace_line(payload), "t", frozenset({"temperature"})) == []
    problems = cw.payload_problems(trace_line(payload), "t")
    assert any("unknown key 'temperature'" in p for p in problems)
