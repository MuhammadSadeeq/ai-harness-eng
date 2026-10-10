"""Tests for tools/check_katas.py, using the fixtures under tools/tests/fixtures/katas/.

These run the real pytest and hxtest on the fixture candidates (about 9 s in total).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "katas"
COURSE = FIXTURES / "course.json"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_katas", ROOT / "tools" / "check_katas.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


checker = _load()


def _run(*ids: str, course: Path | None = COURSE) -> Any:
    return checker.run(list(ids), FIXTURES, course)


def _messages(report: Any) -> list[str]:
    return [p.message for p in report.problems]


def test_good_kata_passes_and_runners_agree() -> None:
    report = _run("good-add")
    assert report.problems == []
    assert report.last_line() == "check_katas: 1 katas OK (3 candidates, runners agree)"


def test_starter_that_already_passes_is_reported() -> None:
    assert _messages(_run("starter-passes")) == [
        "starter passes every test; it must fail at least one"
    ]


def test_wrong_solution_that_passes_is_reported() -> None:
    assert _messages(_run("wrong-passes")) == [
        "wrong solution 'swapped-args' passes every test; it must fail at least one"
    ]


def test_precise_value_kata_passes_with_the_real_runners() -> None:
    report = _run("precise-mean")
    assert report.problems == []


def test_broken_runner_is_caught_as_a_disagreement(monkeypatch: pytest.MonkeyPatch) -> None:
    def coarse_runner(work: Path) -> dict[str, bool]:
        # A runner that passes everything: the precise-value test cannot tell it apart.
        return {"test_mean_of_three": True, "test_mean_of_two": True}

    monkeypatch.setattr(checker, "_run_hxtest", coarse_runner)
    messages = _messages(_run("precise-mean"))
    assert any(
        "runners disagree on test_mean_of_three: pytest=fail hxtest=pass" in message
        for message in messages
    ), messages


def test_non_stdlib_import_in_the_solution_is_reported() -> None:
    assert _messages(_run("bad-import")) == ["non-stdlib import: numpy"]


def test_metadata_mistakes_are_reported() -> None:
    messages = _messages(_run("bad-meta"))
    for expected in (
        "must equal the folder name",
        "is not an objective of module 'B2'",
        "minutes must be an integer",
        "hints must be exactly 3 strings",
        "from_memory must be true or false",
    ):
        assert any(expected in message for message in messages), messages


def test_unknown_kata_id_is_reported() -> None:
    assert _messages(_run("no-such-kata")) == ["no such kata folder"]


def test_course_none_skips_the_module_checks() -> None:
    messages = _messages(_run("bad-meta", course=None))
    assert not any("is not an objective" in message for message in messages)
    assert any("must equal the folder name" in message for message in messages)


def test_pyodide_flag_fails_when_katas_exist() -> None:
    report = checker.run(["good-add"], FIXTURES, None, pyodide=True)
    assert "pyodide runner not implemented (Phase 1)" in _messages(report)
    assert report.last_line().startswith("check_katas: FAILED (")


def test_zero_katas_passes_even_with_pyodide(tmp_path: Path) -> None:
    report = checker.run([], tmp_path, None, pyodide=True)
    assert report.problems == []
    assert report.last_line() == "check_katas: 0 katas OK (0 candidates, runners agree)"


def test_zero_katas_summary_for_an_empty_folder(tmp_path: Path) -> None:
    report = checker.run([], tmp_path, COURSE)
    assert report.last_line() == "check_katas: 0 katas OK (0 candidates, runners agree)"
