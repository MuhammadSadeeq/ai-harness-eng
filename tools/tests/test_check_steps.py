"""Tests for tools/check_steps.py: small two-step builds in a temporary folder, one failure
at a time, then the real steps (CPython; the Pyodide agreement is checked once)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_steps", ROOT / "tools" / "check_steps.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


checker = _load()


def t1_step() -> dict[str, Any]:
    return {
        "module": "T1",
        "number": 1,
        "title": "One line",
        "goal": "Print one line.",
        "lines_after": 1,
        "chunks": [
            {
                "id": "1a",
                "title": "Print",
                "explain": "Print the hello line.",
                "hunks": [{"where": "new code", "diff": '+print("hello")\n'}],
            }
        ],
        "checkpoint": {"argv": [], "expected": "hello\n", "explain": "It printed hello."},
        "breaks": [
            {
                "id": "bye",
                "title": "Say bye",
                "explain": "Change the text.",
                "change": {"patch": {"diff": '-print("hello")\n+print("bye")\n'}},
                "expected": "bye\n",
            }
        ],
    }


def t2_step() -> dict[str, Any]:
    return {
        "module": "T2",
        "number": 2,
        "title": "Two lines",
        "goal": "Print two lines.",
        "lines_after": 2,
        "chunks": [
            {
                "id": "2a",
                "title": "Again",
                "explain": "Print again.",
                "hunks": [
                    {"where": "after the print", "diff": ' print("hello")\n+print("again")\n'}
                ],
            }
        ],
        "checkpoint": {"argv": [], "expected": "hello\nagain\n", "explain": "Two lines."},
        "breaks": [
            {
                "id": "upper",
                "title": "Shout",
                "explain": "Change the word.",
                "change": {"patch": {"diff": '-print("again")\n+print("AGAIN")\n'}},
                "expected": "hello\nAGAIN\n",
            }
        ],
    }


T1_FILE = 'print("hello")\n'
T2_FILE = 'print("hello")\nprint("again")\n'


def build(
    tmp_path: Path,
    t1: dict[str, Any] | None = None,
    t2: dict[str, Any] | None = None,
    t1_file: str = T1_FILE,
    t2_file: str = T2_FILE,
) -> tuple[Path, Path]:
    steps = tmp_path / "steps"
    for module, data, text in (("T1", t1 or t1_step(), t1_file), ("T2", t2 or t2_step(), t2_file)):
        folder = steps / module
        folder.mkdir(parents=True)
        (folder / "step.yaml").write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
        (folder / "rein.py").write_text(text, encoding="utf-8")
    course = tmp_path / "course.json"
    course.write_text(json.dumps({"path": ["T1", "T2"]}), encoding="utf-8")
    return steps, course


def messages(problems: list[Any]) -> list[str]:
    return [p.message for p in problems]


def test_a_good_two_step_build_passes_on_cpython(tmp_path: Path) -> None:
    steps, course = build(tmp_path)
    problems, count, breaks, _, ran, _ = checker.run(steps, course)
    assert problems == [], messages(problems)
    assert (count, breaks, ran) == (2, 2, False)


def test_a_chunk_whose_grey_lines_are_missing_is_named(tmp_path: Path) -> None:
    t2 = t2_step()
    t2["chunks"][0]["hunks"][0]["diff"] = ' print("nowhere")\n+print("again")\n'
    steps, course = build(tmp_path, t2=t2)
    problems, *_ = checker.run(steps, course)
    assert any(
        "chunk 2a does not apply: the grey lines are not in the file" in m
        for m in messages(problems)
    )


def test_grey_lines_found_twice_are_reported_with_both_lines(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["lines_after"] = 2
    t1["chunks"][0]["hunks"][0]["diff"] = '+print("hello")\n+print("hello")\n'
    steps, course = build(tmp_path, t1=t1, t1_file='print("hello")\nprint("hello")\n')
    problems, *_ = checker.run(steps, course)
    assert any(
        "chunk 2a does not apply: the grey lines are in the file twice (lines 1 and 2)" in m
        for m in messages(problems)
    ), messages(problems)


def test_a_built_file_that_differs_from_rein_py_is_reported(tmp_path: Path) -> None:
    steps, course = build(tmp_path, t1_file='print("bye")\n')
    problems, *_ = checker.run(steps, course)
    assert any("the chunks give a different file" in m for m in messages(problems))


def test_a_wrong_line_count_is_reported(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["lines_after"] = 3
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any("rein.py has 1 lines, lines_after says 3" in m for m in messages(problems))


def test_a_checkpoint_that_prints_something_else_is_reported(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["checkpoint"]["expected"] = "hi\n"
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any(
        "checkpoint output differs" in m and "expected 'hi'" in m for m in messages(problems)
    )


def test_a_break_with_the_checkpoint_output_is_reported(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["breaks"][0]["change"] = {"patch": {"diff": ' print("hello")\n'}}
    t1["breaks"][0]["expected"] = "hello\n"
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any("break bye gives the checkpoint's output" in m for m in messages(problems))


def test_a_change_with_two_kinds_is_a_problem(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["breaks"][0]["change"] = {"patch": {"diff": '-print("hello")\n+print("bye")\n'}, "argv": []}
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any("needs exactly one of" in m for m in messages(problems))


def test_an_argv_break_that_changes_nothing_is_reported(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["breaks"][0] = {
        "id": "unknown",
        "title": "Unknown",
        "explain": "No argument is read.",
        "change": {"argv": ["extra"]},
        "expected": "hello\n",
    }
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any("break unknown gives the checkpoint's output" in m for m in messages(problems)), (
        messages(problems)
    )


def test_a_break_whose_change_does_not_apply_is_a_problem(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["breaks"][0]["change"] = {"patch": {"diff": '-print("nothing")\n+print("bye")\n'}}
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    assert any("break bye change does not apply" in m for m in messages(problems)), messages(
        problems
    )


def test_steps_are_applied_in_course_order(tmp_path: Path) -> None:
    steps, course = build(tmp_path)
    course.write_text(json.dumps({"path": ["T2", "T1"]}), encoding="utf-8")
    problems, *_ = checker.run(steps, course)
    assert any("chunk 2a does not apply" in m for m in messages(problems)), messages(problems)


def test_pyodide_disagreement_is_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    steps, course = build(tmp_path)

    def flipped(jobs: list[Any], pyodide_dir: Path, report: list[Any]) -> list[dict[str, Any]]:
        return [{"stdout": "not what cpython printed\n", "error": ""} for _ in jobs]

    monkeypatch.setattr(checker, "check_pyodide", flipped)
    problems, _, _, in_browser, ran, _ = checker.run(steps, course, pyodide=True)
    assert in_browser == 2 and ran is True
    assert any("differs from CPython" in m for m in messages(problems)), messages(problems)


def test_pyodide_agrees_with_cpython_on_the_two_step_build(tmp_path: Path) -> None:
    steps, course = build(tmp_path)
    problems, _, _, _, ran, _ = checker.run(steps, course, pyodide=True)
    assert problems == [], messages(problems)
    assert ran is True


def steps_on_disk(steps_dir: Path) -> tuple[int, int]:
    """(step folders, breaks), read from steps/ itself: each folder with a step.yaml (not _shared),
    and the breaks each step.yaml lists. The real steps are not pinned to a number here."""
    folders = [
        folder
        for folder in sorted(steps_dir.iterdir())
        if folder.is_dir() and folder.name != checker.SHARED and (folder / "step.yaml").is_file()
    ]
    breaks = 0
    for folder in folders:
        data = yaml.safe_load((folder / "step.yaml").read_text(encoding="utf-8")) or {}
        breaks += len(data.get("breaks") or [])
    return len(folders), breaks


def test_the_real_steps_pass(tmp_path: Path) -> None:
    folders, expected_breaks = steps_on_disk(ROOT / "steps")
    assert folders >= 1, "steps/ has no step to prove"
    problems, count, breaks, _, _, _ = checker.run(ROOT / "steps", ROOT / "course.json")
    assert problems == [], messages(problems)
    assert (count, breaks) == (folders, expected_breaks)


def test_no_steps_folder_passes_with_zero_steps(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert checker.main(["--steps", str(tmp_path / "missing")]) == 0
    assert capsys.readouterr().out.strip() == "check_steps: 0 steps (no steps/ folder yet)"


# ---- BP-4.0: the stand-in, stdin, local runs (fixture steps under tools/tests/fixtures/steps) ----

FIXTURES = ROOT / "tools" / "tests" / "fixtures" / "steps"
RUNNER_JS = ROOT / "site" / "assets" / "components" / "lib" / "py-worker.js"


def _fixture_copy(tmp_path: Path, edit: Any = None) -> Path:
    """A copy of the fixture steps, with step.yaml changed by edit (a function of the mapping)."""
    import shutil

    target = tmp_path / "steps"
    shutil.copytree(FIXTURES, target)
    if edit is not None:
        path = target / "FX1" / "step.yaml"
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        edit(data)
        path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return target


def test_the_fixture_passes_on_cpython_with_one_local_run(tmp_path: Path) -> None:
    problems, count, breaks, in_browser, ran, local = checker.run(
        _fixture_copy(tmp_path), None, pyodide=False
    )
    assert problems == [], messages(problems)
    assert (count, breaks, in_browser, ran, local) == (1, 4, 1, False, 1)


def test_the_fixture_passes_under_pyodide_and_the_local_break_is_skipped(tmp_path: Path) -> None:
    problems, count, breaks, in_browser, ran, local = checker.run(
        _fixture_copy(tmp_path), None, pyodide=True
    )
    assert problems == [], messages(problems)
    assert ran is True and local == 1
    assert (count, breaks) == (1, 4)


def test_a_browser_run_the_stand_in_refuses_names_the_command_and_suggests_local(
    tmp_path: Path,
) -> None:
    def not_local(data: dict[str, Any]) -> None:
        for brk in data["breaks"]:
            if brk["id"] == "list-folder":
                brk.pop("local", None)

    problems, *_ = checker.run(_fixture_copy(tmp_path, not_local), None, pyodide=True)
    text = " ".join(messages(problems))
    assert "list-folder" in text
    assert "the browser run of `python rein.py ls` differs from CPython" in text
    assert "refused `ls`" in text
    assert "mark it `local: true`" in text


def test_stdin_reaches_input_under_both_runners(tmp_path: Path) -> None:
    def wrong_answer(data: dict[str, Any]) -> None:
        for brk in data["breaks"]:
            if brk["id"] == "answer-no":
                brk["stdin"] = ["y"]  # the expected output says denied: the run must say allowed

    problems, *_ = checker.run(_fixture_copy(tmp_path, wrong_answer), None, pyodide=False)
    text = messages(problems)
    assert any("break answer-no output differs" in m for m in text), text


def test_a_break_without_input_runs_out_of_input_the_same_way(tmp_path: Path) -> None:
    def no_answer(data: dict[str, Any]) -> None:
        for brk in data["breaks"]:
            if brk["id"] == "answer-no":
                brk.pop("stdin", None)

    problems, *_ = checker.run(_fixture_copy(tmp_path, no_answer), None, pyodide=True)
    text = " ".join(messages(problems))
    assert "break answer-no output differs" in text
    assert "Pyodide and CPython" not in text, "both runners end the same way when input runs out"


def test_stdin_must_be_a_list_of_lines(tmp_path: Path) -> None:
    def bad(data: dict[str, Any]) -> None:
        data["breaks"][2]["stdin"] = "n"

    problems: list[Any] = []
    assert checker.load_step(_fixture_copy(tmp_path, bad) / "FX1", problems) is None
    assert any("stdin must be a list of lines" in m for m in messages(problems)), messages(problems)


def test_local_must_be_true_or_false(tmp_path: Path) -> None:
    def bad(data: dict[str, Any]) -> None:
        data["checkpoint"]["local"] = "yes"

    problems: list[Any] = []
    assert checker.load_step(_fixture_copy(tmp_path, bad) / "FX1", problems) is None
    assert any("local must be true or false" in m for m in messages(problems)), messages(problems)


def test_the_summary_line_counts_local_runs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert checker.main(["--steps", str(FIXTURES), "--course", "none", "--pyodide"]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_steps: 1 steps OK (4 breaks, 1 local; CPython and Pyodide agree)"
    )


def test_the_browser_runner_is_the_same_text_as_the_checker_runner() -> None:
    """py-worker.js keeps its own copy of RUNNER (the page runs it); the two must not drift."""
    source = RUNNER_JS.read_text(encoding="utf-8")
    start = source.index("const RUNNER = `") + len("const RUNNER = `")
    end = source.index("`;", start)
    page_copy = source[start:end].replace("\\`", "`").replace("\\$", "$")
    assert page_copy.strip() == checker.RUNNER.strip()


def _line_of(text: str, needle: str, after: str = "") -> int:
    """The 1-based line of the first line with needle, after the first line with after."""
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if after in line) if after else 0
    return next(i + 1 for i in range(start, len(lines)) if needle in lines[i])


def test_a_checkpoint_mismatch_is_reported_at_the_expected_line(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["checkpoint"]["expected"] = "hi\n"
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    text = (steps / "T1" / "step.yaml").read_text(encoding="utf-8")
    line = _line_of(text, "expected:", after="checkpoint:")
    found = [p for p in problems if "checkpoint output differs" in p.message]
    assert len(found) == 1 and found[0].line == line, [(p.line, p.message) for p in problems]
    assert text.splitlines()[line - 1].lstrip().startswith("expected:")


def test_a_break_mismatch_is_reported_at_its_expected_line(tmp_path: Path) -> None:
    t1 = t1_step()
    t1["breaks"][0]["change"] = {"patch": {"diff": ' print("hello")\n'}}
    t1["breaks"][0]["expected"] = "bye\n"
    steps, course = build(tmp_path, t1=t1)
    problems, *_ = checker.run(steps, course)
    text = (steps / "T1" / "step.yaml").read_text(encoding="utf-8")
    line = _line_of(text, "expected:", after="breaks:")
    found = [p for p in problems if p.message.startswith("break ")]
    assert len(found) == 2, [(p.line, p.message) for p in problems]
    assert all(p.line == line for p in found), [(p.line, p.message) for p in problems]
