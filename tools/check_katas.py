"""check_katas: checks every kata under katas/ (AUTHORING §8, DECISIONS D-015, D-016).

Usage: check_katas.py [ID ...] [--katas DIR] [--course PATH|none] [--pyodide]

Each candidate (starter, solution, wrong solutions) runs under pytest and under the stdlib
runner site/assets/py/hxtest.py; the two must agree on every test. With --pyodide, every candidate
also runs under hxtest in Pyodide (one Node process for all katas) and must agree with CPython on
every test. The starter must fail a test, the solution must pass all, and every wrong solution must
fail one. A kata whose id starts with ``lab-`` belongs to no module (module: null) and skips the
course checks. Problems print as ``path:line: message``; the last line is the summary.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.lib.kata_blank import BlankError, memory_blank  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KATAS = REPO_ROOT / "katas"
DEFAULT_COURSE = REPO_ROOT / "course.json"
HXTEST = REPO_ROOT / "site" / "assets" / "py" / "hxtest.py"
PYODIDE_DIR = REPO_ROOT / "node_modules" / "pyodide"
RUN_TIMEOUT = 60.0
PYODIDE_TIMEOUT = 600.0
KATA_FILES = ("meta.yaml", "starter.py", "solution.py", "test_kata.py")
META_REQUIRED = ("id", "module", "title", "objectives", "minutes", "hints", "from_memory")
META_OPTIONAL = ("wrong_solutions",)
LAB_PREFIX = "lab-"
COLLECTION = "<collection>"
STDLIB = frozenset(sys.stdlib_module_names)

Outcomes = dict[str, bool]

# One Node process: loads Pyodide once, runs hxtest on each job in its own folder, writes results.
# Jobs are awaited with runPythonAsync, so async tests run on Pyodide's own event loop
# (hxtest.run_async).
NODE_SCRIPT = """
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const request = JSON.parse(readFileSync(0, "utf8"));
const { loadPyodide } = await import(pathToFileURL(join(request.pyodideDir, "pyodide.mjs")).href);
const pyodide = await loadPyodide({
  indexURL: request.pyodideDir.endsWith("/") ? request.pyodideDir : `${request.pyodideDir}/`,
  stdout: () => {},
  stderr: () => {},
});
pyodide.FS.mkdirTree("/hx");
pyodide.FS.writeFile("/hx/hxtest.py", request.hxtest);
pyodide.runPython("import sys\\nsys.path.insert(0, '/hx')");
const results = [];
for (const [index, job] of request.jobs.entries()) {
  const dir = `/work/job${index}`;
  pyodide.FS.mkdirTree(dir);
  pyodide.FS.writeFile(`${dir}/kata.py`, job.code);
  pyodide.FS.writeFile(`${dir}/test_kata.py`, job.tests);
  try {
    const call = `json.dumps(await hxtest.run_async('${dir}/test_kata.py'))`;
    const script = ["import json, hxtest", call].join("\\n");
    const text = await pyodide.runPythonAsync(script);
    results.push({ tests: JSON.parse(text).tests });
  } catch (error) {
    results.push({ error: String(error?.message ?? error).slice(0, 300) });
  }
}
writeFileSync(request.result, JSON.stringify(results));
"""


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
    pyodide: bool = False

    def error(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message))

    def last_line(self) -> str:
        if self.problems:
            return f"check_katas: FAILED ({len(self.problems)} problems)"
        agreement = "CPython and Pyodide agree" if self.pyodide else "runners agree"
        return f"check_katas: {self.katas} katas OK ({self.candidates} candidates, {agreement})"


@dataclass
class Candidate:
    kata: str
    label: str
    code: str
    tests: str
    where: str
    outcomes: Outcomes | None = None
    line: int = 0  # where the candidate is written: its def line, or its name in meta.yaml


def run(
    ids: list[str],
    katas_dir: Path,
    course: Path | None,
    pyodide: bool = False,
    pyodide_dir: Path = PYODIDE_DIR,
) -> Report:
    """Check the katas named in ``ids`` (all of them when empty)."""
    report = Report()
    modules = _load_course(course, report) if course is not None else None
    selected = _select(ids, katas_dir, report)
    failed: set[str] = set()
    candidates: list[Candidate] = []
    for folder in selected:
        before = len(report.problems)
        candidates.extend(_check_kata(folder, modules, report))
        if len(report.problems) > before:
            failed.add(folder.name)
    if pyodide and candidates:
        _pyodide_check(candidates, pyodide_dir, report, failed)
    for candidate in candidates:
        if candidate.outcomes is None:
            continue
        before = len(report.problems)
        _expect(candidate.label, candidate.outcomes, candidate.where, candidate.line, report)
        if len(report.problems) > before:
            failed.add(candidate.kata)
    report.katas = len(selected) - len(failed)
    report.candidates = sum(1 for candidate in candidates if candidate.kata not in failed)
    return report


def _select(ids: list[str], katas_dir: Path, report: Report) -> list[Path]:
    if not ids:
        return _kata_folders(katas_dir)
    selected: list[Path] = []
    for kata_id in ids:
        folder = katas_dir / kata_id
        if folder.is_dir():
            selected.append(folder)
        else:
            report.error(_display(folder), 0, "no such kata folder")
    return selected


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


def _check_kata(
    folder: Path,
    modules: dict[str, set[str]] | None,
    report: Report,
) -> list[Candidate]:
    """Checks one kata's files and metadata, and evaluates each candidate under CPython."""
    missing = [name for name in KATA_FILES if not (folder / name).is_file()]
    for name in missing:
        report.error(_display(folder / name), 0, "missing file")
    if missing:
        return []
    meta = _load_meta(folder / "meta.yaml", report)
    if meta is None:
        return []
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
    wrong_lines = _wrong_solution_lines(folder / "meta.yaml")
    for name, code in wrong:
        for message in _import_problems(code, frozenset()):
            report.error(
                _display(folder / "meta.yaml"),
                wrong_lines.get(name, 0),
                f"wrong solution '{name}': {message}",
            )
    starter_path = folder / "starter.py"
    solution_path = folder / "solution.py"
    entry = _entry_names(tests)
    candidates: list[Candidate] = [
        Candidate(
            folder.name, "starter", starter, tests, _display(starter_path),
            line=_def_line(starter_path, entry),
        ),
        Candidate(
            folder.name, "solution", solution, tests, _display(solution_path),
            line=_def_line(solution_path, entry),
        ),
    ]
    where = _display(folder / "meta.yaml")
    candidates.extend(
        Candidate(
            folder.name, f"wrong solution '{name}'", code, tests, where,
            line=wrong_lines.get(name, 0),
        )
        for name, code in wrong
    )
    if meta.get("from_memory") is True:
        # A from-memory kata's blank (what the learner starts from) must import and fail every test.
        try:
            blank = memory_blank(solution, tests, folder.name)
        except (BlankError, SyntaxError) as exc:
            report.error(
                _display(solution_path), _def_line(solution_path, entry), f"memory blank: {exc}"
            )
        else:
            candidates.append(
                Candidate(folder.name, "memory blank", blank, tests, where,
                          line=_def_line(solution_path, entry))
            )
    for candidate in candidates:
        if _import_problems(candidate.code, frozenset()):
            continue
        candidate.outcomes = _evaluate(candidate.code, tests, candidate.where, report)
    return candidates


DEF_LINE = re.compile(r"^\s*(?:async\s+)?def\s+(\w+)\s*\(")


def _entry_names(tests: str) -> frozenset[str]:
    """The names the test file imports from kata: the functions the kata is about."""
    try:
        tree = ast.parse(tests)
    except SyntaxError:
        return frozenset()
    return frozenset(
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module == "kata"
        for alias in node.names
    )


def _def_line(path: Path, entry: frozenset[str] = frozenset()) -> int:
    """The line (1-based) of a candidate file's entry def: the first def, sync or async, whose name
    the test imports (entry). Without one, the first def. 1 when there is no def at all."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return 1
    defs: list[tuple[int, str]] = []
    for number, line in enumerate(lines, start=1):
        match = DEF_LINE.match(line)
        if match:
            defs.append((number, match.group(1)))
    for number, name in defs:
        if name in entry:
            return number
    return defs[0][0] if defs else 1


def _wrong_solution_lines(meta_path: Path) -> dict[str, int]:
    """The line of each wrong solution's name in meta.yaml, by name."""
    try:
        root = yaml.compose(meta_path.read_text(encoding="utf-8"), Loader=yaml.SafeLoader)
    except (OSError, yaml.YAMLError):
        return {}
    if not isinstance(root, yaml.MappingNode):
        return {}
    lines: dict[str, int] = {}
    for key, value in root.value:
        if not (isinstance(key, yaml.ScalarNode) and key.value == "wrong_solutions"):
            continue
        if not isinstance(value, yaml.SequenceNode):
            continue
        for entry in value.value:
            if not isinstance(entry, yaml.MappingNode):
                continue
            for entry_key, entry_value in entry.value:
                if (isinstance(entry_key, yaml.ScalarNode) and entry_key.value == "name"
                        and isinstance(entry_value, yaml.ScalarNode)):
                    lines[entry_value.value] = int(entry_key.start_mark.line) + 1
    return lines


def _expect(label: str, outcomes: Outcomes, where: str, line: int, report: Report) -> None:
    if label == "starter":
        if all(outcomes.values()):
            report.error(where, line, "starter passes every test; it must fail at least one")
    elif label == "solution":
        failing = sorted(name for name, passed in outcomes.items() if not passed)
        if failing:
            report.error(where, line, f"solution fails: {', '.join(failing)}")
    elif label == "memory blank":
        # The blank is what the learner starts from, not a solution: it must import and fail a test.
        if COLLECTION in outcomes:
            report.error(where, line, "memory blank does not import cleanly")
        elif all(outcomes.values()):
            report.error(where, line, "memory blank passes every test; it must fail at least one")
    elif all(outcomes.values()):
        report.error(where, line, f"{label} passes every test; it must fail at least one")


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


def _pyodide_check(
    candidates: list[Candidate],
    pyodide_dir: Path,
    report: Report,
    failed: set[str],
) -> None:
    """Runs every agreed candidate in Pyodide and requires the CPython outcome for each test."""
    jobs = [candidate for candidate in candidates if candidate.outcomes is not None]
    if not jobs:
        return
    try:
        rows = _run_pyodide(jobs, pyodide_dir)
    except RunnerError as exc:
        report.error(_display(pyodide_dir), 0, f"pyodide runner: {exc}")
        failed.update(job.kata for job in jobs)
        return
    report.pyodide = True
    for job, (outcomes, error) in zip(jobs, rows, strict=True):
        if error is not None or outcomes is None:
            report.error(job.where, 0, f"pyodide could not run {job.label}: {error}")
            failed.add(job.kata)
            continue
        expected = job.outcomes or {}
        for name in sorted(set(expected) | set(outcomes)):
            if expected.get(name) != outcomes.get(name):
                report.error(
                    job.where,
                    0,
                    f"pyodide disagrees on {name}: cpython={_verdict(expected.get(name))} "
                    f"pyodide={_verdict(outcomes.get(name))}",
                )
                failed.add(job.kata)


def _run_pyodide(
    jobs: list[Candidate],
    pyodide_dir: Path,
) -> list[tuple[Outcomes | None, str | None]]:
    node = shutil.which("node")
    if node is None:
        raise RunnerError("node is not on PATH")
    if not (pyodide_dir / "pyodide.mjs").is_file():
        raise RunnerError(f"Pyodide is not installed in {_display(pyodide_dir)} (run npm ci)")
    with tempfile.TemporaryDirectory(prefix="kata-pyodide-") as scratch:
        work = Path(scratch)
        result_path = work / "result.json"
        request = {
            "pyodideDir": str(pyodide_dir),
            "hxtest": HXTEST.read_text(encoding="utf-8"),
            "result": str(result_path),
            "jobs": [{"code": job.code, "tests": job.tests} for job in jobs],
        }
        try:
            completed = subprocess.run(
                [node, "--input-type=module", "-e", NODE_SCRIPT],
                input=json.dumps(request),
                cwd=work,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=PYODIDE_TIMEOUT,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RunnerError(f"Pyodide timed out after {PYODIDE_TIMEOUT:g} s") from exc
        if not result_path.is_file():
            raise RunnerError(
                f"Pyodide wrote no result (exit {completed.returncode}): "
                f"{_tail(completed.stdout + completed.stderr)}"
            )
        data: Any = json.loads(result_path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or len(data) != len(jobs):
        raise RunnerError("Pyodide returned a different number of results")
    rows: list[tuple[Outcomes | None, str | None]] = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("error"), str):
            rows.append((None, item["error"]))
        else:
            rows.append((_outcomes_from_tests(item.get("tests")), None))
    return rows


def _verdict(passed: bool | None) -> str:
    if passed is None:
        return "not run"
    return "pass" if passed else "fail"


# pytest has no asyncio support in this environment (no pytest-asyncio), so the work folder
# gets this
# hook: an async def test_* runs on asyncio.run, as hxtest does. The kata itself stays plain.
CONFTEST = """\
import asyncio
import inspect

import pytest


@pytest.hookimpl(tryfirst=True)
def pytest_pyfunc_call(pyfuncitem):
    if inspect.iscoroutinefunction(pyfuncitem.obj):
        asyncio.run(pyfuncitem.obj(**pyfuncitem.funcargs))
        return True
    return None
"""


def _run_pytest(work: Path) -> Outcomes:
    (work / "conftest.py").write_text(CONFTEST, encoding="utf-8")
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
    return _outcomes_from_tests(tests)


def _outcomes_from_tests(tests: Any) -> Outcomes:
    """Pass or fail per test name, from hxtest's JSON list (a collection error is its own entry)."""
    outcomes: Outcomes = {}
    for test in tests if isinstance(tests, list) else []:
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
    is_lab = folder.name.startswith(LAB_PREFIX)

    def fail(message: str) -> None:
        report.error(display, 0, message)

    for key in meta:
        if key not in META_REQUIRED and key not in META_OPTIONAL:
            fail(f"unknown key '{key}'")
    for key in META_REQUIRED:
        if key not in meta:
            fail(f"missing key '{key}'")
    if "id" in meta and meta["id"] != folder.name:
        fail(f"id {meta['id']!r} must equal the folder name {folder.name!r}")
    module = meta.get("module")
    if "module" in meta:
        if module is not None and not isinstance(module, str):
            fail("module must be a string or null")
        elif is_lab and module is not None:
            fail("a lab- kata has module: null")
        elif not is_lab and module is None:
            fail("module must name a course module (only lab- katas have module: null)")
    if isinstance(module, str) and modules is not None and module not in modules:
        fail(f"module {module!r} is not in course.json")
    title = meta.get("title")
    if "title" in meta and (not isinstance(title, str) or not title.strip()):
        fail("title must be a non-empty string")
    objectives = meta.get("objectives")
    if "objectives" in meta:
        if not isinstance(objectives, list) or (not objectives and not is_lab):
            fail("objectives must be a list" if is_lab else "objectives must be a non-empty list")
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
    test_defs = (ast.FunctionDef, ast.AsyncFunctionDef)
    return [
        node.name
        for node in tree.body
        if isinstance(node, test_defs) and node.name.startswith("test_")
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
    parser.add_argument(
        "--pyodide",
        action="store_true",
        help="also run every candidate in Pyodide (needs node and node_modules/pyodide)",
    )
    args = parser.parse_args(argv)
    course = None if args.course == "none" else Path(args.course)
    report = run(args.ids, args.katas, course, args.pyodide)
    for problem in report.problems:
        print(problem.render())
    print(report.last_line())
    return 1 if report.problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
