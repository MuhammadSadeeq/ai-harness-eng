"""check_scenarios and the engine tapes (ENGINE.md A8.6): their own folder, boards and goldens, no
incident block, coverage and parity like any tape. The fake JS runs the Python harness."""

from __future__ import annotations

import importlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "rein" / "src"))

cs: Any = importlib.import_module("check_scenarios")
load_board = importlib.import_module("rein.board").load_board
load_tape = importlib.import_module("rein.tape").load_tape
run_trial = importlib.import_module("rein.sim").run_trial
trace_line = importlib.import_module("rein.pyjson").trace_line

SCENARIOS = ROOT / "scenarios"
FACTS = ROOT / "site" / "data" / "facts.json"


def fake_js(argv: list[str]) -> str:
    """The JS CLI's contract, answered by the Python harness itself."""
    facts: Any = json.loads(FACTS.read_text(encoding="utf-8"))
    if argv[2:3] == ["eval"]:  # A11.8: the eval object, answered by the Python engine here
        evals = importlib.import_module("rein.evals")
        spec = evals.load_eval(Path(argv[argv.index("--eval") + 1]))
        board = load_board(Path(argv[argv.index("--board") + 1]))
        tapes = evals.load_tapes(spec, Path(argv[argv.index("--scenarios") + 1]))
        return trace_line(evals.run_eval(spec, tapes, board, facts)) + "\n"
    tape = load_tape(Path(argv[argv.index("--tape") + 1]))
    board = load_board(Path(argv[argv.index("--board") + 1]))
    trial = run_trial(tape, board, int(argv[argv.index("--seed") + 1]), facts)
    if "--choices" in argv:
        lines = [trace_line([loc, idx]) for loc, idx in trial.result.choices]
    elif "--wire" in argv:
        lines = [trace_line(item) for item in trial.wire]
    else:
        lines = [trace_line(item) for item in trial.events]
    return "".join(line + "\n" for line in lines)


def make_engine(tmp_path: Path, tape_name: str, boards: list[str], seeds: list[int]) -> Path:
    """A scenario directory: the real schemas, one engine tape and its boards under engine/."""
    scen = tmp_path / "scenarios"
    (scen / "boards").mkdir(parents=True)
    (scen / "engine" / "boards").mkdir(parents=True)
    for name in ("schema.json", "board.schema.json", "trace.schema.json"):
        shutil.copy(SCENARIOS / name, scen / name)
    raw = json.loads((SCENARIOS / "engine" / f"{tape_name}.json").read_text(encoding="utf-8"))
    raw["boards"] = boards
    raw["golden_seeds"] = seeds
    (scen / "engine" / f"{tape_name}.json").write_text(json.dumps(raw), encoding="utf-8")
    for board in boards:
        shutil.copy(
            SCENARIOS / "engine" / "boards" / f"{board}.json",
            scen / "engine" / "boards" / f"{board}.json",
        )
    return scen


def messages(report: Any) -> list[str]:
    return [p.message for p in report.problems]


def run_check(scen: Path, **kwargs: Any) -> Any:
    return cs.check(scen, js=fake_js, facts_path=FACTS, **kwargs)


def test_engine_tapes_are_discovered_apart_from_the_incident_tapes(tmp_path: Path) -> None:
    scen = make_engine(tmp_path, "eng-split", ["eng-split-split"], [0, 1])
    assert cs._discover_tapes(scen) == []  # the top level holds no tapes  # noqa: SLF001
    found = cs._discover_tapes(scen / "engine")  # noqa: SLF001
    assert [p.name for p in found] == ["eng-split.json"]


def test_an_engine_update_writes_goldens_into_the_engine_folder(tmp_path: Path) -> None:
    scen = make_engine(tmp_path, "eng-split", ["eng-split-split"], [0, 1])
    assert run_check(scen, update="eng-split").problems == []
    assert len(list((scen / "golden" / "engine").glob("*.jsonl"))) == 2
    assert len(list((scen / "golden" / "engine").glob("*.wire.sha256"))) == 2
    assert not list((scen / "golden").glob("*.jsonl"))  # nothing at the top of golden/


def test_engine_goldens_are_compared_after_the_update(tmp_path: Path) -> None:
    scen = make_engine(tmp_path, "eng-split", ["eng-split-split"], [0, 1])
    run_check(scen, update="eng-split")
    report = run_check(scen)
    assert report.problems == []
    assert (report.tapes, report.runs) == (1, 2)


def test_a_missing_engine_golden_is_reported_in_the_engine_folder(tmp_path: Path) -> None:
    report = run_check(make_engine(tmp_path, "eng-split", ["eng-split-split"], [0]))
    assert any("golden/engine" in message for message in messages(report))


def test_an_engine_tape_needs_no_incident_block(tmp_path: Path) -> None:
    report = run_check(make_engine(tmp_path, "eng-split", ["eng-split-split"], [0, 1]))
    assert not any("incident" in message for message in messages(report))


def test_engine_branch_coverage_applies(tmp_path: Path) -> None:
    # Seed 0 only ever takes option 0 of the 50/50 branch, so option 1 is never taken.
    report = run_check(make_engine(tmp_path, "eng-split", ["eng-split-split"], [0]))
    assert any("branch coverage: option 1" in message for message in messages(report))


def test_an_engine_board_is_looked_up_in_the_engine_boards(tmp_path: Path) -> None:
    report = run_check(make_engine(tmp_path, "eng-split", ["eng-split-split"], [0]))
    assert not any("not found" in message for message in messages(report))


def test_suggest_seeds_includes_the_engine_tapes(tmp_path: Path) -> None:
    lines = cs.suggest_seeds(
        make_engine(tmp_path, "eng-split", ["eng-split-split", "eng-split-joined"], [0]), 3, FACTS
    )
    assert any("eng-split.json" in line and "golden_seeds" in line for line in lines)


def test_the_real_engine_tapes_pass_parity_and_coverage_with_their_goldens() -> None:
    report = cs.check(
        SCENARIOS, js=fake_js, facts_path=FACTS, tapes=[SCENARIOS / "engine" / "eng-split.json"]
    )
    assert report.problems == []
