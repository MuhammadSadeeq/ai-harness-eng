"""Tests for site/assets/py/hxtest.py (the stdlib kata runner). Files are written to tmp_path."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "hxtest", ROOT / "site" / "assets" / "py" / "hxtest.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


hxtest = _load()


def _write(tmp_path: Path, test_source: str, kata_source: str | None = None) -> Path:
    if kata_source is not None:
        (tmp_path / "kata.py").write_text(kata_source, encoding="utf-8")
    path = tmp_path / "test_kata.py"
    path.write_text(test_source, encoding="utf-8")
    return path


def _outcomes(result: Any) -> dict[str, str]:
    return {test["name"]: test["outcome"] for test in result["tests"]}


def _message(result: Any, name: str) -> str:
    message: str = next(test["message"] for test in result["tests"] if test["name"] == name)
    return message


def test_tests_run_in_source_order(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "def test_b():\n    pass\n\n\ndef test_a():\n    pass\n\n\ndef test_c():\n    pass\n",
    )
    result = hxtest.run(str(path))
    assert [test["name"] for test in result["tests"]] == ["test_b", "test_a", "test_c"]
    assert result["passed"] == 3 and result["failed"] == 0 and result["errors"] == 0


def test_bare_comparison_is_rewritten_with_both_sides(tmp_path: Path) -> None:
    path = _write(tmp_path, "def test_sum():\n    assert 1 + 2 == 4\n")
    result = hxtest.run(str(path))
    assert _outcomes(result) == {"test_sum": "failed"}
    assert _message(result, "test_sum") == "assert 3 == 4"


def test_assertion_inside_a_helper_is_reported_with_its_own_values(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "def check(value):\n    assert value != 2\n\n\ndef test_helper():\n    check(2)\n",
    )
    result = hxtest.run(str(path))
    assert _message(result, "test_helper") == "assert 2 != 2"


def test_own_assertion_message_is_used_verbatim(tmp_path: Path) -> None:
    path = _write(tmp_path, 'def test_msg():\n    assert False, "custom text"\n')
    result = hxtest.run(str(path))
    assert _message(result, "test_msg") == "custom text"


def test_non_comparison_assert_reports_the_source_text(tmp_path: Path) -> None:
    path = _write(tmp_path, "def test_truthy():\n    assert not [1]\n")
    result = hxtest.run(str(path))
    assert _message(result, "test_truthy") == "assert not [1]"


def test_failures_and_errors_are_different_outcomes(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "def test_fail():\n    assert 0\n\n\ndef test_error():\n    raise ValueError('bad')\n",
    )
    result = hxtest.run(str(path))
    assert _outcomes(result) == {"test_fail": "failed", "test_error": "error"}
    assert result["failed"] == 1 and result["errors"] == 1
    assert _message(result, "test_error") == "ValueError: bad"


def test_import_error_of_the_test_file_is_one_collection_error(tmp_path: Path) -> None:
    path = _write(tmp_path, "raise RuntimeError('boom at import')\n\n\ndef test_x():\n    pass\n")
    result = hxtest.run(str(path))
    assert result["tests"] == [
        {"name": "<collection>", "outcome": "error", "message": "RuntimeError: boom at import"}
    ]
    assert result["errors"] == 1 and result["passed"] == 0


def test_syntax_error_is_a_collection_error(tmp_path: Path) -> None:
    path = _write(tmp_path, "def test_x(:\n    pass\n")
    result = hxtest.run(str(path))
    assert [test["name"] for test in result["tests"]] == ["<collection>"]
    assert result["errors"] == 1


def test_kata_import_works_and_a_new_kata_is_loaded_each_run(tmp_path: Path) -> None:
    test_source = "from kata import value\n\n\ndef test_value():\n    assert value == 7\n"
    path = _write(tmp_path, test_source, kata_source="value = 7\n")
    assert hxtest.run(str(path))["passed"] == 1
    (tmp_path / "kata.py").write_text("value = 8\n", encoding="utf-8")
    result = hxtest.run(str(path))
    assert _message(result, "test_value") == "assert 8 == 7"


def test_print_inside_a_test_does_not_corrupt_json(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _write(tmp_path, "def test_noisy():\n    print('hello from the kata')\n")
    code = hxtest.main([str(path), "--json"])
    data = json.loads(capsys.readouterr().out)
    assert code == 0
    assert data["passed"] == 1


def test_json_output_has_the_documented_shape(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _write(tmp_path, "def test_bad():\n    assert 3 == 4\n")
    code = hxtest.main([str(path), "--json"])
    data = json.loads(capsys.readouterr().out)
    assert code == 1
    assert data == {
        "tests": [{"name": "test_bad", "outcome": "failed", "message": "assert 3 == 4"}],
        "passed": 0,
        "failed": 1,
        "errors": 0,
    }


def test_text_output_lines_and_summary(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _write(
        tmp_path,
        "def test_ok():\n    pass\n\n\ndef test_bad():\n    assert 3 == 4\n\n\n"
        "def test_err():\n    raise KeyError('k')\n",
    )
    code = hxtest.main([str(path)])
    lines = capsys.readouterr().out.strip().splitlines()
    assert code == 1
    assert lines == [
        "PASS test_ok",
        "FAIL test_bad: assert 3 == 4",
        "ERROR test_err: KeyError: 'k'",
        "hxtest: 1 passed, 1 failed, 1 errors",
    ]


def test_exit_code_is_zero_only_when_everything_passes(tmp_path: Path) -> None:
    passing = _write(tmp_path, "def test_ok():\n    pass\n")
    assert hxtest.main([str(passing)]) == 0
