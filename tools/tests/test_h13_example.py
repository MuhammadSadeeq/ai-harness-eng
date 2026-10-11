"""The H13 worked example (rein/examples/h13-process-check) proves the numbers the H13 page shows.

The patch must apply to the committed rein/src/rein/evals.py and change nothing else. In two
sandboxes (the package as committed, and the package with the patch applied by git), the
package's own ``python -m rein eval`` must give: the D1 suite at 10 of 10 on every task with and
without the check; the control at 10 of 10 without it and 0 of 10 with it, with the same tokens
in both runs. The table rows printed by ``python -m rein results --markdown`` must equal the rows
the page shows.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import jsonschema
import pytest

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = Path("rein/examples/h13-process-check")
PATCH = EXAMPLE / "write-before-read.patch"
CONTROL_EVAL = EXAMPLE / "scenarios" / "evals" / "d1-control.json"
CONTROL_TAPE = EXAMPLE / "scenarios" / "d1-control-write-first.json"
SUITE_EVAL = Path("scenarios/evals/d1-suite.json")
BOARD = Path("scenarios/boards/d1-old.json")
SUITE_TASKS = ("example-a", "example-b", "held-out-a", "held-out-b", "held-out-c")

FOOTER = "These numbers are scripted: they repeat exactly. A real model's numbers would vary."
WILSON_ALL = "72.2% to 100.0%"


def _row(task: str, passed: str, interval: str, tokens: str, cost: str) -> str:
    return f"| {task} | {passed} | {interval} | {tokens} | {cost} | yes |"


# Rows of Table H13.1 on the H13 page (the package's own markdown output, scripted).
SUITE_ROWS = {
    "example-a": _row("example-a", "10 of 10", WILSON_ALL, "9,950 in, 560 out", "$0.0255"),
    "example-b": _row("example-b", "10 of 10", WILSON_ALL, "10,100 in, 690 out", "$0.0271"),
    "held-out-a": _row("held-out-a", "10 of 10", WILSON_ALL, "59,950 in, 2,860 out", "$0.1485"),
    "held-out-b": _row("held-out-b", "10 of 10", WILSON_ALL, "61,110 in, 3,010 out", "$0.1523"),
    "held-out-c": _row("held-out-c", "10 of 10", WILSON_ALL, "60,930 in, 2,990 out", "$0.1518"),
}
CONTROL_ROW_BASELINE = _row(
    "control-write-first", "10 of 10", WILSON_ALL, "31,770 in, 1,910 out", "$0.0826"
)
CONTROL_ROW_EXTENSION = _row(
    "control-write-first", "0 of 10", "0.0% to 27.8%", "31,770 in, 1,910 out", "$0.0826"
)


def _sandbox(base: Path, patched: bool) -> Path:
    """A copy of the package, its scenarios and the facts file, with the patch applied if asked."""
    shutil.copytree(
        ROOT / "rein",
        base / "rein",
        ignore=shutil.ignore_patterns(
            "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "tests"
        ),
    )
    shutil.copytree(ROOT / "scenarios", base / "scenarios")
    (base / "site" / "data").mkdir(parents=True)
    shutil.copy(ROOT / "site" / "data" / "facts.json", base / "site" / "data" / "facts.json")
    if patched:
        applied = subprocess.run(
            ["git", "apply", str(ROOT / PATCH)], cwd=base, capture_output=True, text=True
        )
        assert applied.returncode == 0, applied.stderr
    return base


def _rein(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run the package's CLI from the sandbox, importing rein from the sandbox's src."""
    env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    env["PYTHONPATH"] = str(root / "rein" / "src")
    proc = subprocess.run(
        [sys.executable, "-m", "rein", *args],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    return proc


def _eval(root: Path, eval_path: Path, out_name: str) -> dict[str, Any]:
    _rein(root, ["eval", "--eval", str(eval_path), "--board", str(BOARD), "--out", out_name])
    loaded: dict[str, Any] = json.loads((root / out_name).read_text(encoding="utf-8"))
    return loaded


def _markdown(root: Path, out_name: str) -> list[str]:
    return _rein(root, ["results", out_name, "--markdown"]).stdout.splitlines()


def _tasks(results: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(task["task"]): task for task in results["tasks"]}


@pytest.fixture(scope="module")
def sandboxes(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    base = tmp_path_factory.mktemp("h13-example")
    return {
        "plain": _sandbox(base / "plain", patched=False),
        "patched": _sandbox(base / "patched", patched=True),
    }


@pytest.fixture(scope="module")
def runs(sandboxes: dict[str, Path]) -> dict[str, dict[str, Any]]:
    plain = sandboxes["plain"]
    patched = sandboxes["patched"]
    return {
        "baseline": _eval(plain, SUITE_EVAL, "baseline.json"),
        "control-baseline": _eval(plain, CONTROL_EVAL, "control-baseline.json"),
        "extension": _eval(patched, SUITE_EVAL, "extension.json"),
        "control-extension": _eval(patched, CONTROL_EVAL, "control-extension.json"),
    }


def test_patch_touches_only_evals_py() -> None:
    headers = [
        line
        for line in (ROOT / PATCH).read_text(encoding="utf-8").splitlines()
        if line.startswith("diff --git ")
    ]
    assert headers == ["diff --git a/rein/src/rein/evals.py b/rein/src/rein/evals.py"]


def test_suite_passes_every_task_with_and_without_check(runs: dict[str, dict[str, Any]]) -> None:
    for name in ("baseline", "extension"):
        tasks = _tasks(runs[name])
        assert list(tasks) == list(SUITE_TASKS), name
        for task_id in SUITE_TASKS:
            assert tasks[task_id]["passed"] == 10, (name, task_id)
            assert tasks[task_id]["trials"] == 10, (name, task_id)


def test_control_passes_without_check_and_fails_with_it(
    runs: dict[str, dict[str, Any]],
) -> None:
    baseline = _tasks(runs["control-baseline"])["control-write-first"]
    extension = _tasks(runs["control-extension"])["control-write-first"]
    assert (baseline["passed"], baseline["trials"]) == (10, 10)
    assert (extension["passed"], extension["trials"]) == (0, 10)


def test_check_changes_no_tokens(runs: dict[str, dict[str, Any]]) -> None:
    for before, after in (
        ("baseline", "extension"),
        ("control-baseline", "control-extension"),
    ):
        old = _tasks(runs[before])
        new = _tasks(runs[after])
        for task_id, task in old.items():
            assert new[task_id]["tokens"] == task["tokens"], (before, task_id)
            assert new[task_id]["cost"] == task["cost"], (before, task_id)


def test_page_rows_match_package_markdown(sandboxes: dict[str, Path]) -> None:
    lines = _markdown(sandboxes["plain"], "baseline.json")
    for row in SUITE_ROWS.values():
        assert row in lines
    assert FOOTER in lines
    assert CONTROL_ROW_BASELINE in _markdown(sandboxes["plain"], "control-baseline.json")
    assert CONTROL_ROW_EXTENSION in _markdown(sandboxes["patched"], "control-extension.json")
    patched_lines = _markdown(sandboxes["patched"], "extension.json")
    for row in SUITE_ROWS.values():
        assert row in patched_lines


def test_control_files_match_scenario_schemas() -> None:
    tape = json.loads((ROOT / CONTROL_TAPE).read_text(encoding="utf-8"))
    evaluation = json.loads((ROOT / CONTROL_EVAL).read_text(encoding="utf-8"))
    tape_schema = json.loads((ROOT / "scenarios" / "schema.json").read_text(encoding="utf-8"))
    eval_schema = json.loads((ROOT / "scenarios" / "eval.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(tape, tape_schema)
    jsonschema.validate(evaluation, eval_schema)
