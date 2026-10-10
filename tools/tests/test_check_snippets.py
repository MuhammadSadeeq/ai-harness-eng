"""Tests for tools/check_snippets.py, using the fixtures under tools/tests/fixtures/snippets/."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "snippets"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "check_snippets", ROOT / "tools" / "check_snippets.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


checker = _load()


def _check(name: str) -> Any:
    return checker.run([FIXTURES / name])


def _messages(report: Any) -> list[str]:
    return [f"{p.line}: {p.message}" for p in report.problems]


def test_passing_snippet_has_no_problems() -> None:
    report = _check("pass.html")
    assert report.problems == []
    assert report.last_line() == "check_snippets: 1 snippets OK in 1 files"


def test_entities_are_unescaped_before_running_and_comparing() -> None:
    assert _check("entities.html").problems == []


def test_wrong_output_is_reported_at_the_snippet_line() -> None:
    report = _check("wrong_output.html")
    assert len(report.problems) == 1
    assert report.problems[0].line == 3
    assert "output differs" in report.problems[0].message
    assert report.last_line() == "check_snippets: FAILED (1 problems)"


def test_expected_exception_passes() -> None:
    assert _check("raises_pass.html").problems == []


def test_wrong_exception_and_normal_exit_are_both_reported() -> None:
    report = _check("raises_fail.html")
    messages = _messages(report)
    assert len(messages) == 2, messages
    assert "expected ValueError as the last stderr line" in messages[0]
    assert "expected ValueError but the snippet exited normally" in messages[1]


def test_missing_output_block_is_reported_when_a_paragraph_intervenes() -> None:
    report = _check("no_output.html")
    assert len(report.problems) == 1
    assert "missing <pre data-output>" in report.problems[0].message


def test_non_stdlib_import_is_reported_without_running_the_code() -> None:
    report = _check("non_stdlib.html")
    assert _messages(report) == ["3: non-stdlib import: requests"]


def test_timeout_is_reported() -> None:
    report = _check("timeout.html")
    assert _messages(report) == ["3: timed out after 1 s"]


def test_nonzero_exit_without_data_raises_is_reported() -> None:
    report = _check("exit_status.html")
    assert len(report.problems) == 1
    assert "exited with status 1" in report.problems[0].message


def test_directory_scan_skips_site_vendor(tmp_path: Path) -> None:
    site = tmp_path / "site"
    (site / "vendor").mkdir(parents=True)
    (site / "vendor" / "broken.html").write_text(
        '<pre data-run>import requests</pre>\n', encoding="utf-8"
    )
    (site / "page.html").write_text(
        '<pre data-run>print(1)</pre>\n<pre data-output>1</pre>\n', encoding="utf-8"
    )
    report = checker.run([site])
    assert report.problems == []
    assert report.last_line() == "check_snippets: 1 snippets OK in 1 files"


def test_empty_site_is_zero_snippets(tmp_path: Path) -> None:
    report = checker.run([tmp_path])
    assert report.last_line() == "check_snippets: 0 snippets OK in 0 files"
