"""check_scenarios with an injected fake JS command: parity (events, wire, choices), the first
difference, refused golden updates, schema errors, A4 incident references, branch coverage and
the seed suggestions (ENGINE.md section 10, A3.22, A4)."""

from __future__ import annotations

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

cs: Any = importlib.import_module("check_scenarios")
load_board = importlib.import_module("rein.board").load_board
run_trial = importlib.import_module("rein.sim").run_trial
load_tape = importlib.import_module("rein.tape").load_tape
trace_line = importlib.import_module("rein.pyjson").trace_line

SCENARIOS = ROOT / "scenarios"
FACTS = ROOT / "site" / "data" / "facts.json"
SEEDS = [0, 1]  # the suggested set: together they take both branch options


def make_scenarios(tmp_path: Path, tape_edit: Any = None) -> Path:
    """A scenario directory: the real schemas, the b2-spiral tape (with two golden seeds, its
    incident as is) and its boards under boards/. ``tape_edit`` may change the tape dict."""
    scen = tmp_path / "scenarios"
    (scen / "boards").mkdir(parents=True)
    for name in ("schema.json", "board.schema.json", "trace.schema.json"):
        shutil.copy(SCENARIOS / name, scen / name)
    for board in ("b2-old", "b2-new"):
        shutil.copy(SCENARIOS / "boards" / f"{board}.json", scen / "boards" / f"{board}.json")
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["golden_seeds"] = SEEDS
    if tape_edit is not None:
        tape_edit(raw)
    (scen / "b2-spiral.json").write_text(json.dumps(raw), encoding="utf-8")
    return scen


@cache
def python_outputs(board_id: str, seed: int) -> tuple[tuple[str, ...], ...]:
    """(events, wire, choices) lines of the untouched b2-spiral tape."""
    tape = load_tape(SCENARIOS / "b2-spiral.json")
    board = load_board(SCENARIOS / "boards" / f"{board_id}.json")
    facts: Any = json.loads(FACTS.read_text(encoding="utf-8"))
    trial = run_trial(tape, board, seed, facts)
    return (
        tuple(trace_line(e) for e in trial.events),
        tuple(trace_line(w) for w in trial.wire),
        tuple(trace_line([loc, idx]) for loc, idx in trial.result.choices),
    )


def fake_js(argv: list[str]) -> str:
    board = Path(argv[argv.index("--board") + 1]).stem
    seed = int(argv[argv.index("--seed") + 1])
    events, wire, choices = python_outputs(board, seed)
    if "--choices" in argv:
        lines = choices
    elif "--wire" in argv:
        lines = wire
    else:
        lines = events
    return "".join(line + "\n" for line in lines)


def run_check(scen: Path, js: Any = fake_js, **kwargs: Any) -> Any:
    return cs.check(scen, js=js, facts_path=FACTS, **kwargs)


def messages(report: Any) -> list[str]:
    return [p.message for p in report.problems]


# ---- parity ----------------------------------------------------------------------------------


def test_parity_ok_after_golden_update(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)
    assert run_check(scen, update="b2-spiral").problems == []
    assert len(list((scen / "golden").glob("*.jsonl"))) == 4  # events, in full
    assert len(list((scen / "golden").glob("*.wire.sha256"))) == 4  # the wire, as a digest
    report = run_check(scen)
    assert report.problems == []
    assert (report.tapes, report.runs) == (1, 4)


def test_missing_golden_is_reported_until_updated(tmp_path: Path) -> None:
    report = run_check(make_scenarios(tmp_path))
    assert any("golden file missing" in m for m in messages(report))


def test_first_difference_reports_both_lines(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)

    def broken(argv: list[str]) -> str:
        lines = fake_js(argv).splitlines()
        if "--wire" not in argv and "--choices" not in argv:
            lines[2] = lines[2].replace('"v":1', '"v":2')
        return "".join(line + "\n" for line in lines)

    found = [m for m in messages(run_check(scen, js=broken)) if "differ at line 3" in m]
    assert found and '"v":2' in found[0] and '"v":1' in found[0]


def test_choices_are_compared_with_js(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)

    def wrong_choice(argv: list[str]) -> str:
        if "--choices" in argv:
            return '["/script/3",0]\n'
        return fake_js(argv)

    rendered = [p.render() for p in run_check(scen, js=wrong_choice).problems]
    assert any("(choices)" in r and "differ" in r for r in rendered), rendered[:3]


def test_golden_update_is_refused_on_mismatch(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)

    def broken(argv: list[str]) -> str:
        return "" if "--wire" in argv else fake_js(argv).replace("run_end", "run_xxx", 1)

    report = run_check(scen, js=broken, update="b2-spiral")
    assert any("golden update refused" in m for m in messages(report))
    assert not list((scen / "golden").glob("*.jsonl"))


def test_a_length_mismatch_is_reported(tmp_path: Path) -> None:
    def short(argv: list[str]) -> str:
        return "".join(line + "\n" for line in fake_js(argv).splitlines()[:-1])

    assert any(
        "lines, js has" in m for m in messages(run_check(make_scenarios(tmp_path), js=short))
    )


def test_schema_errors_are_reported(tmp_path: Path) -> None:
    def drop_window(raw: dict[str, Any]) -> None:
        del raw["window"]

    report = run_check(make_scenarios(tmp_path, drop_window))
    assert any("'window' is a required property" in m for m in messages(report))


def test_tape_id_must_equal_its_stem(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)
    raw = json.loads((scen / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["id"] = "other"
    (scen / "b2-spiral.json").write_text(json.dumps(raw), encoding="utf-8")
    assert any("must equal the file stem" in m for m in messages(run_check(scen)))


def test_js_failure_is_a_problem_not_a_crash(tmp_path: Path) -> None:
    def failing(argv: list[str]) -> str:
        raise cs.JsUnavailableError("exit 1: no such file")

    assert any(
        "js simulator failed" in m
        for m in messages(run_check(make_scenarios(tmp_path), js=failing))
    )


def test_event_schema_violations_are_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real = cs._python_run

    def corrupt(*args: Any, **kwargs: Any) -> Any:
        events, wire, choice_lines, objects, choices = real(*args, **kwargs)
        objects[1]["kind"] = "prompt_built_typo"
        return events, wire, choice_lines, objects, choices

    monkeypatch.setattr(cs, "_python_run", corrupt)
    assert any("event schema" in m for m in messages(run_check(make_scenarios(tmp_path))))


def test_main_reports_a_result_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    scen = make_scenarios(tmp_path)
    monkeypatch.setattr(cs, "subprocess_js", fake_js)
    assert cs.main(["--scenarios", str(scen), "--facts", str(FACTS), "--update", "b2-spiral"]) == 0
    assert cs.main(["--scenarios", str(scen), "--facts", str(FACTS)]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_scenarios: 1 tapes, 4 runs, parity OK"
    )


def test_main_fails_loudly_without_the_js_simulator(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def absent(argv: list[str]) -> str:
        raise cs.JsUnavailableError("exit 1")

    monkeypatch.setattr(cs, "subprocess_js", absent)
    assert cs.main(["--scenarios", str(make_scenarios(tmp_path)), "--facts", str(FACTS)]) == 1
    assert capsys.readouterr().out.strip().splitlines()[-1].startswith("check_scenarios: FAILED (")


def test_zero_tapes_pass_with_the_schema_only(tmp_path: Path) -> None:
    scen = tmp_path / "scenarios"
    scen.mkdir()
    for name in ("schema.json", "board.schema.json", "trace.schema.json"):
        shutil.copy(SCENARIOS / name, scen / name)
    report = run_check(scen)
    assert report.problems == [] and report.tapes == 0


# ---- A4: incident references -------------------------------------------------------------------


def edit_incident(**changes: Any) -> Any:
    def edit(raw: dict[str, Any]) -> None:
        raw["incident"] = {**raw["incident"], **changes}

    return edit


def incident_problems(tmp_path: Path, **changes: Any) -> list[str]:
    report = run_check(make_scenarios(tmp_path, edit_incident(**changes)), js=lambda argv: "")
    return [m for m in messages(report) if m.startswith("incident b2-spiral:")]


def test_a4_a_good_incident_has_no_reference_problems(tmp_path: Path) -> None:
    assert incident_problems(tmp_path) == []


def test_a4_the_family_must_exist_in_course_json(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, family="no-such-family")
    assert any("not in course.json failure_families" in m for m in found), found


def test_a4_the_wire_must_equal_the_familys_wire(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, wire="verify")
    assert any("has wire" in m and "but the incident says 'verify'" in m for m in found), found


def test_a4_the_board_must_be_one_of_the_tapes_boards(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, board="b2-elsewhere")
    assert any("is not one of the tape's boards" in m for m in found), found


def test_a4_the_seed_must_be_a_golden_seed(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, seed=99)
    assert any("is not one of the golden_seeds" in m for m in found), found


def test_a4_first_bad_seq_must_exist_in_the_trace(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, first_bad_seq=99999)
    assert any("first_bad_seq 99999 does not exist" in m for m in found), found


def test_a4_accept_seqs_must_exist_in_the_trace(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, accept_seqs=[99999])
    assert any("accept_seqs 99999 does not exist" in m for m in found), found


def test_a4_notes_seqs_must_exist_in_the_trace(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, notes=[{"seq": 99999, "text": "x"}])
    assert any("notes.seq 99999 does not exist" in m for m in found), found


def test_a4_correct_fix_must_index_the_fixes(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, correct_fix=7)
    assert any("correct_fix 7 is not an index" in m for m in found), found


def test_a4_problems_name_the_tape(tmp_path: Path) -> None:
    found = incident_problems(tmp_path, family="no-such-family")
    assert found and all(m.startswith("incident b2-spiral:") for m in found)


# ---- A3.22: branch coverage and suggested seeds --------------------------------------------------


def coverage_problems(tmp_path: Path, golden_seeds: list[int]) -> list[str]:
    def set_seeds(raw: dict[str, Any]) -> None:
        raw["golden_seeds"] = golden_seeds

    report = run_check(make_scenarios(tmp_path, set_seeds), js=lambda argv: "")
    return [m for m in messages(report) if "branch coverage" in m]


def test_a3_22_an_option_no_golden_seed_takes_is_reported(tmp_path: Path) -> None:
    # Seeds 1 and 2 both take the spiral option (1): option 0 is never taken.
    found = coverage_problems(tmp_path, [1, 2])
    assert found == ["branch coverage: option 0 of /script/3 is never taken by any golden seed"]


def test_a3_22_all_options_taken_is_clean(tmp_path: Path) -> None:
    assert coverage_problems(tmp_path, [0, 1]) == []


def test_a3_22_suggest_seeds_covers_every_reachable_option(tmp_path: Path) -> None:
    lines = cs.suggest_seeds(make_scenarios(tmp_path), 10, FACTS)
    assert len(lines) == 1
    assert lines[0].endswith(
        "b2-spiral.json: golden_seeds [0, 1] covers 2 of 2 reachable branch options"
    )


def test_a3_22_suggest_seeds_reports_unreached_options(tmp_path: Path) -> None:
    lines = cs.suggest_seeds(make_scenarios(tmp_path), 1, FACTS)
    assert "covers 1 of 1 reachable branch options" in lines[0]
    assert any("not reached by seeds 0..0: /script/3 option 1" in line for line in lines)


def test_a3_22_suggest_seeds_main_prints_and_succeeds(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = cs.main(
        [
            "--scenarios",
            str(make_scenarios(tmp_path)),
            "--facts",
            str(FACTS),
            "--suggest-seeds",
            "2",
        ]
    )
    assert code == 0
    assert "golden_seeds" in capsys.readouterr().out


# ---- A3.23: the wire golden is a SHA-256 digest; events stay in full ----------------------------


def test_a3_23_the_update_writes_events_in_full_and_the_wire_as_a_digest(tmp_path: Path) -> None:
    import hashlib  # noqa: PLC0415

    scen = make_scenarios(tmp_path)
    run_check(scen, update="b2-spiral")
    events, wire, _ = python_outputs("b2-old", 0)
    events_file = scen / "golden" / "b2-spiral.b2-old.0.jsonl"
    digest_file = scen / "golden" / "b2-spiral.b2-old.0.wire.sha256"
    assert events_file.read_text(encoding="utf-8") == "".join(line + "\n" for line in events)
    assert not (scen / "golden" / "b2-spiral.b2-old.0.wire.jsonl").exists()
    expected = hashlib.sha256("".join(line + "\n" for line in wire).encode("utf-8")).hexdigest()
    assert digest_file.read_text(encoding="utf-8") == expected + "\n"


def test_a3_23_the_compare_reads_the_digest(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)
    run_check(scen, update="b2-spiral")
    (scen / "golden" / "b2-spiral.b2-old.0.wire.sha256").write_text(
        "0" * 64 + "\n", encoding="utf-8"
    )
    found = messages(run_check(scen))
    assert any("golden wire digest" in m and "differs" in m for m in found), found[:3]


def test_a3_23_a_missing_digest_is_reported(tmp_path: Path) -> None:
    found = messages(run_check(make_scenarios(tmp_path)))
    assert any("golden digest missing" in m for m in found), found[:3]


def test_a3_23_a_tampered_event_golden_is_still_reported(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)
    run_check(scen, update="b2-spiral")
    events_file = scen / "golden" / "b2-spiral.b2-old.0.jsonl"
    events_file.write_text(
        events_file.read_text(encoding="utf-8").replace("run_end", "run_xx", 1), encoding="utf-8"
    )
    found = messages(run_check(scen))
    assert any("golden file" in m and "differs" in m for m in found), found[:3]


def test_a3_23_the_wire_digest_name_is_per_run() -> None:
    path = cs._golden(Path("/x"), "tape", "board", 4, True)  # noqa: SLF001
    assert path == Path("/x/golden/tape.board.4.wire.sha256")


def test_a3_8_the_board_schema_rejects_an_uppercase_egress_entry(tmp_path: Path) -> None:
    scen = make_scenarios(tmp_path)
    board = json.loads((scen / "boards" / "b2-old.json").read_text(encoding="utf-8"))
    board["modules"]["sandbox"] = {"egress": ["Api.Example.com"]}
    (scen / "boards" / "b2-old.json").write_text(json.dumps(board), encoding="utf-8")
    found = messages(run_check(scen))
    assert any(
        m.startswith("schema:") and "modules/sandbox/egress/0" in m and "[A-Z]" in m for m in found
    ), found[:3]
