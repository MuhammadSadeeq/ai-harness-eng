"""Tests for tools/check_katas.py, using the fixtures under tools/tests/fixtures/katas/.

These run the real pytest and hxtest on the fixture candidates (about 9 s in total).
"""

from __future__ import annotations

import importlib.util
import shutil
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


def test_unknown_meta_key_is_an_error() -> None:
    assert _messages(_run("unknown-key")) == ["unknown key 'colour'"]


def test_unknown_kata_id_is_reported() -> None:
    assert _messages(_run("no-such-kata")) == ["no such kata folder"]


def test_course_none_skips_the_module_checks() -> None:
    messages = _messages(_run("bad-meta", course=None))
    assert not any("is not an objective" in message for message in messages)
    assert any("must equal the folder name" in message for message in messages)


def test_lab_kata_with_no_module_and_no_objectives_passes() -> None:
    report = _run("lab-ok")
    assert report.problems == [], _messages(report)
    assert report.last_line() == "check_katas: 1 katas OK (3 candidates, runners agree)"


def test_lab_kata_may_not_name_a_module() -> None:
    assert _messages(_run("lab-bad-module")) == ["a lab- kata has module: null"]


def test_a_kata_that_is_not_a_lab_kata_needs_a_module() -> None:
    assert _messages(_run("null-module")) == [
        "module must name a course module (only lab- katas have module: null)"
    ]


def test_pyodide_agrees_with_cpython_on_the_fixtures() -> None:
    report = checker.run(["good-add"], FIXTURES, COURSE, pyodide=True)
    assert report.problems == [], _messages(report)
    assert report.last_line() == "check_katas: 1 katas OK (3 candidates, CPython and Pyodide agree)"


def test_pyodide_disagreement_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    def flipped_first_test(jobs: list[Any], pyodide_dir: Path) -> list[Any]:
        rows: list[Any] = []
        for job in jobs:
            outcomes = dict(job.outcomes or {})
            first = next(iter(outcomes))
            outcomes[first] = not outcomes[first]
            rows.append((outcomes, None))
        return rows

    monkeypatch.setattr(checker, "_run_pyodide", flipped_first_test)
    messages = _messages(checker.run(["good-add"], FIXTURES, COURSE, pyodide=True))
    assert any("pyodide disagrees on test_adds_small_numbers" in m for m in messages), messages


def test_missing_pyodide_is_a_runner_error(tmp_path: Path) -> None:
    report = checker.run(["good-add"], FIXTURES, COURSE, pyodide=True, pyodide_dir=tmp_path)
    assert any("Pyodide is not installed" in m for m in _messages(report)), _messages(report)
    assert report.last_line().startswith("check_katas: FAILED (")


def test_zero_katas_passes_even_with_pyodide(tmp_path: Path) -> None:
    report = checker.run([], tmp_path, None, pyodide=True)
    assert report.problems == []
    assert report.last_line() == "check_katas: 0 katas OK (0 candidates, runners agree)"


def test_zero_katas_summary_for_an_empty_folder(tmp_path: Path) -> None:
    report = checker.run([], tmp_path, COURSE)
    assert report.last_line() == "check_katas: 0 katas OK (0 candidates, runners agree)"


def _lines(report: Any) -> list[tuple[int, str]]:
    return [(p.line, p.message) for p in report.problems]


def _line_containing(path: Path, needle: str) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    return next(i + 1 for i, line in enumerate(lines) if needle in line)


def test_a_wrong_solution_that_passes_is_reported_at_its_name_in_meta() -> None:
    report = _run("wrong-passes")
    found = [p for p in report.problems if "swapped-args" in p.message]
    expected = _line_containing(FIXTURES / "wrong-passes" / "meta.yaml", "name: swapped-args")
    assert len(found) == 1 and found[0].line == expected, _lines(report)
    assert found[0].path.endswith("wrong-passes/meta.yaml")


def test_a_starter_that_passes_is_reported_at_its_def_line() -> None:
    report = _run("starter-passes")
    expected = _line_containing(FIXTURES / "starter-passes" / "starter.py", "def ")
    found = [p for p in report.problems if "starter passes" in p.message]
    assert len(found) == 1 and found[0].line == expected, _lines(report)


def test_a_memory_blank_that_passes_is_reported_at_the_solution_def_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    kata = tmp_path / "katas" / "good-add"
    kata.parent.mkdir()
    shutil.copytree(FIXTURES / "good-add", kata)
    meta = kata / "meta.yaml"
    text = meta.read_text(encoding="utf-8")
    text = text.replace("from_memory: false", "from_memory: true")
    if "from_memory: true" not in text:
        text += "from_memory: true\n"
    meta.write_text(text, encoding="utf-8")
    monkeypatch.setattr(checker, "memory_blank", lambda solution, tests, name: solution)
    report = checker.run(["good-add"], tmp_path / "katas", COURSE)
    found = [p for p in report.problems if "memory blank passes" in p.message]
    expected = _line_containing(kata / "solution.py", "def ")
    assert len(found) == 1 and found[0].line == expected, _lines(report)


def test_an_async_def_is_found_as_the_entry_def(tmp_path: Path) -> None:
    path = tmp_path / "starter.py"
    path.write_text("import asyncio\n\n\nasync def fetch(url):\n    return url\n", encoding="utf-8")
    assert checker._def_line(path) == 4
    assert checker._def_line(path, frozenset({"fetch"})) == 4


def test_the_def_the_test_imports_wins_over_a_helper_defined_first(tmp_path: Path) -> None:
    path = tmp_path / "solution.py"
    path.write_text(
        "def _parts(text):\n    return text.split()\n\n\n"
        "def hit_percent(read, total):\n    return 99 * read // total\n",
        encoding="utf-8",
    )
    assert checker._def_line(path, frozenset({"hit_percent"})) == 5
    assert checker._def_line(path) == 1, "without the test's import, the first def"


def test_the_names_the_test_imports_from_kata_are_the_entry_names() -> None:
    tests = "from kata import hit_percent, parts\n\n\ndef test_x():\n    assert hit_percent(1, 2)\n"
    assert checker._entry_names(tests) == frozenset({"hit_percent", "parts"})
    assert checker._entry_names("import math\n") == frozenset()
    assert checker._entry_names("def test_x(:\n") == frozenset(), "a broken test file has no names"
