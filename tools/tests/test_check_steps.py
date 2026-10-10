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
    problems, count, breaks, _, ran = checker.run(steps, course)
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
    problems, _, _, in_browser, ran = checker.run(steps, course, pyodide=True)
    assert in_browser == 2 and ran is True
    assert any("Pyodide and CPython differ" in m for m in messages(problems)), messages(problems)


def test_pyodide_agrees_with_cpython_on_the_two_step_build(tmp_path: Path) -> None:
    steps, course = build(tmp_path)
    problems, _, _, _, ran = checker.run(steps, course, pyodide=True)
    assert problems == [], messages(problems)
    assert ran is True


def test_the_real_steps_pass(tmp_path: Path) -> None:
    problems, count, breaks, _, _ = checker.run(ROOT / "steps", ROOT / "course.json")
    assert problems == [], messages(problems)
    assert count == 2 and breaks == 5


def test_no_steps_folder_passes_with_zero_steps(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert checker.main(["--steps", str(tmp_path / "missing")]) == 0
    assert capsys.readouterr().out.strip() == "check_steps: 0 steps (no steps/ folder yet)"
