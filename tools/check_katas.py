"""check_katas: checks every kata under katas/ (AUTHORING §8, DECISIONS D-016).

Usage: check_katas.py [ID ...] [--katas DIR] [--course PATH|none] [--pyodide]

Each candidate (starter, solution, wrong solutions) runs under pytest and under the stdlib
runner site/assets/py/hxtest.py; the two must agree on every test. The starter must fail a
test, the solution must pass all, and every wrong solution must fail one.
Problems print as ``path:line: message``; the last line is the summary.
"""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KATAS = REPO_ROOT / "katas"
DEFAULT_COURSE = REPO_ROOT / "course.json"
HXTEST = REPO_ROOT / "site" / "assets" / "py" / "hxtest.py"
RUN_TIMEOUT = 60.0
KATA_FILES = ("meta.yaml", "starter.py", "solution.py", "test_kata.py")
META_REQUIRED = ("id", "module", "title", "objectives", "minutes", "hints", "from_memory")
COLLECTION = "<collection>"
STDLIB = frozenset(sys.stdlib_module_names)

Outcomes = dict[str, bool]


class RunnerError(Exception):
    """A runner could not produce a usable report for a candidate."""


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


@dataclass
class Report:
    problems: list[Problem] = field(default_factory=list)
    katas: int = 0
    candidates: int = 0

    def error(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message))

    def last_line(self) -> str:
        if self.problems:
            return f"check_katas: FAILED ({len(self.problems)} problems)"
        return (
            f"check_katas: {self.katas} katas OK ({self.candidates} candidates, runners agree)"
        )


def run(
    ids: list[str],
    katas_dir: Path,
    course: Path | None,
    pyodide: bool = False,
) -> Report:
    """Check the katas named in ``ids`` (all of them when empty)."""
    report = Report()
    found = _kata_folders(katas_dir)
    if pyodide and found:
        report.error(_display(katas_dir), 0, "pyodide runner not implemented (Phase 1)")
    modules = _load_course(course, report) if course is not None else None
    selected: list[Path] = []
    if ids:
        for kata_id in ids:
            folder = katas_dir / kata_id
            if folder.is_dir():
                selected.append(folder)
            else:
                report.error(_display(folder), 0, "no such kata folder")
    else:
        selected = found
    for folder in selected:
        before = len(report.problems)
        candidates = _check_kata(folder, modules, report)
        if len(report.problems) == before:
            report.katas += 1
            report.candidates += candidates
    return report


def _kata_folders(katas_dir: Path) -> list[Path]:
    if not katas_dir.is_dir():
        return []
    return sorted(p for p in katas_dir.iterdir() if p.is_dir() and not p.name.startswith("."))


def _load_course(course: Path, report: Report) -> dict[str, set[str]]:
    display = _display(course)
    if not course.is_file():
        report.error(display, 0, "course file not found")
        return {}
    try:
        data: Any = json.loads(course.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error(display, exc.lineno, f"invalid JSON: {exc.msg}")
        return {}
    modules = data.get("modules") if isinstance(data, dict) else None
    if not isinstance(modules, list):
        report.error(display, 0, "course file has no modules list")
        return {}
    result: dict[str, set[str]] = {}
    for module in modules:
        if not isinstance(module, dict) or not isinstance(module.get("id"), str):
            continue
        objectives = module.get("objectives")
        ids = {
            item["id"]
            for item in (objectives if isinstance(objectives, list) else [])
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        result[module["id"]] = ids
    return result


def _check_kata(folder: Path, modules: dict[str, set[str]] | None, report: Report) -> int:
    missing = [name for name in KATA_FILES if not (folder / name).is_file()]
    for name in missing:
        report.error(_display(folder / name), 0, "missing file")
    if missing:
        return 0
    meta = _load_meta(folder / "meta.yaml", report)
    if meta is None:
        return 0
    wrong = _check_meta(folder, meta, modules, report)
    starter = (folder / "starter.py").read_text(encoding="utf-8")
    solution = (folder / "solution.py").read_text(encoding="utf-8")
    tests = (folder / "test_kata.py").read_text(encoding="utf-8")
    if not _test_functions(tests):
        report.error(_display(folder / "test_kata.py"), 0, "defines no test_* functions")
    for name, text, allowed in (
        ("starter.py", starter, frozenset()),
        ("solution.py", solution, frozenset()),
        ("test_kata.py", tests, frozenset({"kata"})),
    ):
        for message in _import_problems(text, allowed):
            report.error(_display(folder / name), 0, message)
    for name, code in wrong:
        for message in _import_problems(code, frozenset()):
            report.error(_display(folder / "meta.yaml"), 0, f"wrong solution '{name}': {message}")
    candidates: list[tuple[str, str, str]] = [
        ("starter", starter, _display(folder / "starter.py")),
        ("solution", solution, _display(folder / "solution.py")),
    ]
    candidates.extend(
        (f"wrong solution '{name}'", code, _display(folder / "meta.yaml"))
        for name, code in wrong
    )
    for label, code, where in candidates:
        if _import_problems(code, frozenset()):
            continue
        outcomes = _evaluate(code, tests, where, report)
        if outcomes is None:
            continue
        _expect(label, outcomes, where, report)
    return len(candidates)


def _expect(label: str, outcomes: Outcomes, where: str, report: Report) -> None:
    if label == "starter":
        if all(outcomes.values()):
            report.error(where, 0, "starter passes every test; it must fail at least one")
    elif label == "solution":
        failing = sorted(name for name, passed in outcomes.items() if not passed)
        if failing:
            report.error(where, 0, f"solution fails: {', '.join(failing)}")
    elif all(outcomes.values()):
        report.error(where, 0, f"{label} passes every test; it must fail at least one")


def _evaluate(code: str, tests: str, where: str, report: Report) -> Outcomes | None:
    with tempfile.TemporaryDirectory(prefix="kata-") as scratch:
        work = Path(scratch)
        (work / "kata.py").write_text(code, encoding="utf-8")
        (work / "test_kata.py").write_text(tests, encoding="utf-8")
        try:
            by_pytest = _run_pytest(work)
            by_hxtest = _run_hxtest(work)
        except RunnerError as exc:
            report.error(where, 0, str(exc))
            return None
    agreed = True
    for name in sorted(set(by_pytest) | set(by_hxtest)):
        left = by_pytest.get(name)
        right = by_hxtest.get(name)
        if left != right:
            agreed = False
            report.error(
                where,
                0,
                f"runners disagree on {name}: pytest={_verdict(left)} hxtest={_verdict(right)}",
            )
    return by_pytest if agreed else None


def _verdict(passed: bool | None) -> str:
    if passed is None:
        return "not run"
    return "pass" if passed else "fail"


def _run_pytest(work: Path) -> Outcomes:
    report_path = work / "r.xml"
    command = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "-p",
        "no:cacheprovider",
        f"--junitxml={report_path}",
        "test_kata.py",
    ]
    completed = _run(command, work)
    if not report_path.is_file():
        raise RunnerError(
            f"pytest wrote no report (exit {completed.returncode}): "
            f"{_tail(completed.stdout + completed.stderr)}"
        )
    return _pytest_outcomes(report_path)


def _pytest_outcomes(report_path: Path) -> Outcomes:
    outcomes: Outcomes = {}
    root = ET.parse(report_path).getroot()
    for case in root.iter("testcase"):
        name = case.get("name", "")
        failed = any(child.tag in ("failure", "error", "skipped") for child in case)
        # A collection (import) error has an empty classname; real tests carry the module name.
        is_collection = not case.get("classname") or name.endswith(".py")
        key = COLLECTION if is_collection else name
        outcomes[key] = outcomes.get(key, True) and not failed
    return outcomes


def _run_hxtest(work: Path) -> Outcomes:
    completed = _run([sys.executable, str(HXTEST), "test_kata.py", "--json"], work)
    try:
        data: Any = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RunnerError(
            f"hxtest printed no JSON (exit {completed.returncode}): "
            f"{_tail(completed.stdout + completed.stderr)}"
        ) from exc
    tests = data.get("tests") if isinstance(data, dict) else None
    if not isinstance(tests, list):
        raise RunnerError("hxtest JSON has no tests list")
    outcomes: Outcomes = {}
    for test in tests:
        if isinstance(test, dict) and isinstance(test.get("name"), str):
            outcomes[test["name"]] = test.get("outcome") == "passed"
    return outcomes


def _run(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=RUN_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RunnerError(f"{Path(command[1]).name} timed out after {RUN_TIMEOUT:g} s") from exc


def _tail(text: str, limit: int = 300) -> str:
    stripped = text.strip()
    return stripped[-limit:] if stripped else "no output"


def _load_meta(file: Path, report: Report) -> dict[str, Any] | None:
    display = _display(file)
    try:
        data: Any = yaml.safe_load(file.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        report.error(display, 0, f"invalid YAML: {exc}")
        return None
    if not isinstance(data, dict):
        report.error(display, 0, "meta.yaml must be a mapping")
        return None
    return data


def _check_meta(
    folder: Path,
    meta: dict[str, Any],
    modules: dict[str, set[str]] | None,
    report: Report,
) -> list[tuple[str, str]]:
    display = _display(folder / "meta.yaml")

    def fail(message: str) -> None:
        report.error(display, 0, message)

    for key in META_REQUIRED:
        if key not in meta:
            fail(f"missing key '{key}'")
    if "id" in meta and meta["id"] != folder.name:
        fail(f"id {meta['id']!r} must equal the folder name {folder.name!r}")
    module = meta.get("module")
    if "module" in meta and not isinstance(module, str):
        fail("module must be a string")
    if isinstance(module, str) and modules is not None and module not in modules:
        fail(f"module {module!r} is not in course.json")
    title = meta.get("title")
    if "title" in meta and (not isinstance(title, str) or not title.strip()):
        fail("title must be a non-empty string")
    objectives = meta.get("objectives")
    if "objectives" in meta:
        if not isinstance(objectives, list) or not objectives:
            fail("objectives must be a non-empty list")
        elif modules is not None and isinstance(module, str) and module in modules:
            for objective in objectives:
                if objective not in modules[module]:
                    fail(f"objective {objective!r} is not an objective of module {module!r}")
    minutes = meta.get("minutes")
    if "minutes" in meta and (not isinstance(minutes, int) or isinstance(minutes, bool)):
        fail("minutes must be an integer")
    hints = meta.get("hints")
    if "hints" in meta and not (
        isinstance(hints, list) and len(hints) == 3 and all(isinstance(h, str) for h in hints)
    ):
        fail("hints must be exactly 3 strings")
    if "from_memory" in meta and not isinstance(meta["from_memory"], bool):
        fail("from_memory must be true or false")
    wrong: list[tuple[str, str]] = []
    entries = meta.get("wrong_solutions", [])
    if not isinstance(entries, list):
        fail("wrong_solutions must be a list")
        return wrong
    for index, entry in enumerate(entries):
        name = entry.get("name") if isinstance(entry, dict) else None
        code = entry.get("code") if isinstance(entry, dict) else None
        if not isinstance(name, str) or not isinstance(code, str) or not code.strip():
            fail(f"wrong_solutions[{index}] needs a name and a code string")
            continue
        wrong.append((name, code))
    return wrong


def _test_functions(tests: str) -> list[str]:
    try:
        tree = ast.parse(tests)
    except SyntaxError:
        return []
    return [
        node.name
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
    ]


def _import_problems(code: str, allowed: frozenset[str]) -> list[str]:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"not valid Python: {exc.msg}"]
    problems: list[str] = []
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level or node.module is None:
                problems.append("relative imports are not allowed")
            else:
                modules.add(node.module.partition(".")[0])
    for name in sorted(modules):
        if name not in STDLIB and name not in allowed:
            problems.append(f"non-stdlib import: {name}")
    return problems


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the katas under katas/.")
    parser.add_argument("ids", nargs="*", help="kata folder names (default: all)")
    parser.add_argument("--katas", type=Path, default=DEFAULT_KATAS, help="katas directory")
    parser.add_argument(
        "--course",
        default=str(DEFAULT_COURSE),
        help="course.json path, or 'none' to skip module checks",
    )
    parser.add_argument("--pyodide", action="store_true", help="check the Pyodide runner (Phase 1)")
    args = parser.parse_args(argv)
    course = None if args.course == "none" else Path(args.course)
    report = run(args.ids, args.katas, course, args.pyodide)
    for problem in report.problems:
        print(problem.render())
    print(report.last_line())
    return 1 if report.problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
