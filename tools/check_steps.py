"""check_steps: checks the Rein build steps under steps/ (BP-2.3).

Usage: check_steps.py [--steps DIR] [--course PATH|none] [--pyodide]

For each build module that has steps/<ID>/, in course.json path order:
  1. the chunks, applied to the previous step's rein.py (empty for the first), give
     this step's rein.py byte for byte, with lines_after lines;
  2. the checkpoint's stdout under CPython equals `expected` (`error: Name` means
     a traceback of that name);
  3. every break's output equals its `expected` and differs from the checkpoint's.
With --pyodide, every step that runs in the browser also runs under Pyodide (one
process for all of them, DECISIONS D-015): the stdout and the error name must equal
CPython's.
A problem prints as path:line: message; the last line is the summary.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STEPS = REPO_ROOT / "steps"
DEFAULT_COURSE = REPO_ROOT / "course.json"
HXSHELL = REPO_ROOT / "site" / "assets" / "py" / "hxshell.py"
PYTHON_MIN = (3, 11)
RUN_TIMEOUT = 30.0
SHARED = "_shared"
CHANGE_KINDS = ("script", "patch", "argv")

# One Node process: loads Pyodide once and runs each job in its own folder.
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
pyodide.FS.writeFile("/hx/hxshell.py", readFileSync(request.hxshell, "utf8"));
pyodide.runPython("import sys\\nsys.path.insert(0, '/hx')");
pyodide.runPython(request.runner);
const results = request.jobs.map((job) => {
  try {
    const text = pyodide.runPython(`run_job(json.loads(${JSON.stringify(JSON.stringify(job))}))`);
    return JSON.parse(text);
  } catch (error) {
    return { error_python: String(error?.message ?? error).slice(0, 300) };
  }
});
writeFileSync(request.result, JSON.stringify(results));
"""

# Runs one job under Pyodide the way the CPython runner does: files written, setup scripts
# run, then rein.py with sys.argv set, stdout captured, and the exception's name as the error.
RUNNER = """
import contextlib, io, json, os, runpy, sys
import hxshell

FILE_CAP = 200 * 1024

def collect(root):
    files = {}
    total = 0
    truncated = False
    for folder, _dirs, names in os.walk(root):
        for name in sorted(names):
            path = os.path.join(folder, name)
            try:
                with open(path, encoding="utf-8") as handle:
                    text = handle.read()
            except (OSError, UnicodeDecodeError):
                continue
            size = len(text.encode("utf-8"))
            if total + size > FILE_CAP:
                truncated = True
                continue
            total += size
            files[os.path.relpath(path, root)] = text
    return files, truncated

def run_job(job):
    hxshell.install()
    hxshell.clear_refused()
    os.makedirs("/work", exist_ok=True)
    root = "/work/" + job["name"]
    os.makedirs(root, exist_ok=True)
    os.chdir(root)
    for path, text in job["files"].items():
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
    out = io.StringIO()
    error = ""
    saved_stdin = sys.stdin
    try:
        for name in job["setup"]:
            # the setup scripts run in their own process under CPython: their output is not the
            # step's
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    with contextlib.redirect_stderr(io.StringIO()):
                        sys.stdin = io.StringIO("")
                    sys.argv = [name + ".py"]
                    runpy.run_path(name + ".py", run_name="__main__")
            except BaseException as exc:
                refused = hxshell.refused_commands()
                return json.dumps({
                    "stdout": "", "error": type(exc).__name__, "refused": refused,
                    "files": {}, "truncated": False,
                })
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            sys.stdin = io.StringIO(job.get("stdin", ""))
            try:
                sys.argv = ["rein.py"] + job["argv"]
                runpy.run_path("rein.py", run_name="__main__")
            except SystemExit as exc:
                if exc.code not in (None, 0):
                    error = "SystemExit"
            except BaseException as exc:
                error = type(exc).__name__
    finally:
        sys.stdin = saved_stdin
    files, truncated = collect(root)
    refused = hxshell.refused_commands()
    return json.dumps({
        "stdout": out.getvalue(), "error": error, "refused": refused,
        "files": files, "truncated": truncated,
    })
"""


class ChunkError(Exception):
    """A chunk does not apply: its grey lines are not in the file, or they are there twice."""


class StepError(Exception):
    """A step file is missing a field or has a wrong shape."""


@dataclass
class Hunk:
    where: str
    lines: list[tuple[str, str]]


@dataclass
class Chunk:
    id: str
    title: str
    hunks: list[Hunk]
    explain: str = ""


@dataclass
class Break:
    id: str
    title: str
    change: dict[str, Any]
    expected: str
    explain: str = ""
    stdin: list[str] = field(default_factory=list)
    local: bool = False


@dataclass
class Step:
    module: str
    number: int
    title: str
    lines_after: int
    chunks: list[Chunk]
    setup: list[str]
    argv: list[str]
    expected: str
    breaks: list[Break]
    runs_in_browser: bool
    path: Path
    scenarios: dict[str, str] = field(default_factory=dict)
    stdin: list[str] = field(default_factory=list)
    local: bool = False
    text: str = ""
    goal: str = ""
    theory: str = ""
    requires_python: str = ""
    explain: str = ""
    size: str = ""

    @property
    def shown(self) -> str:
        return display(self.path / "step.yaml")


@dataclass
class Outcome:
    stdout: str
    error: str


@dataclass
class Problem:
    path: str
    line: int
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


def display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def parse_diff(text: str, where: str) -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []
    for raw in text.split("\n"):
        if raw == "":
            continue
        sign, body = raw[0], raw[1:]
        if sign not in "+- ":
            raise StepError(f"diff line must start with +, - or a space: {raw!r} ({where})")
        lines.append((sign, body))
    return lines


def apply_diff(text: str, lines: list[tuple[str, str]]) -> str:
    """Puts the + lines where the grey (context) and - lines are.

    Those grey and - lines must be in the file exactly once.
    """
    file_lines = text.split("\n")[:-1] if text else []
    old = [body for sign, body in lines if sign in " -"]
    new = [body for sign, body in lines if sign in " +"]
    if not old:
        if file_lines:
            raise ChunkError("the chunk has no grey lines to place it, and the file is not empty")
        return "".join(line + "\n" for line in new)
    hits = [i for i in range(len(file_lines) - len(old) + 1) if file_lines[i : i + len(old)] == old]
    if not hits:
        raise ChunkError("the grey lines are not in the file (context not found)")
    if len(hits) > 1:
        raise ChunkError(
            f"the grey lines are in the file twice (lines {hits[0] + 1} and {hits[1] + 1})"
        )
    start = hits[0]
    result = file_lines[:start] + new + file_lines[start + len(old) :]
    return "".join(line + "\n" for line in result)


def build(previous: str, chunks: list[Chunk]) -> str:
    text = previous
    for chunk in chunks:
        for hunk in chunk.hunks:
            text = apply_diff(text, hunk.lines)
    return text


def load_step(folder: Path, problems: list[Problem]) -> Step | None:
    path = folder / "step.yaml"
    shown = display(path)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        problems.append(Problem(shown, 0, f"cannot read: {exc.strerror}"))
        return None
    except yaml.YAMLError as exc:
        problems.append(Problem(shown, 0, f"invalid YAML: {exc}"))
        return None
    try:
        return parse_step(data, folder)
    except (StepError, KeyError, TypeError, ValueError) as exc:
        problems.append(Problem(shown, 0, str(exc)))
        return None


def parse_step(data: Any, folder: Path) -> Step:
    if not isinstance(data, dict):
        raise StepError("step.yaml must be a mapping")
    module = folder.name
    if data.get("module") != module:
        raise StepError(f"module {data.get('module')!r} must equal the folder name {module!r}")
    chunks = []
    for item in data["chunks"]:
        hunks = [
            Hunk(str(h["where"]), parse_diff(h["diff"], f"chunk {item['id']}"))
            for h in item["hunks"]
        ]
        chunks.append(Chunk(str(item["id"]), item["title"], hunks, str(item.get("explain", ""))))
    check = data["checkpoint"]
    breaks = []
    for item in data.get("breaks", []):
        change = item["change"]
        kinds = [kind for kind in CHANGE_KINDS if kind in change]
        if len(kinds) != 1:
            raise StepError(
                f"break {item['id']}: change needs exactly one of {', '.join(CHANGE_KINDS)}"
            )
        breaks.append(
            Break(
                item["id"],
                item.get("title", item["id"]),
                change,
                item["expected"],
                str(item.get("explain", "")),
                _stdin(item, f"break {item['id']}"),
                _local(item, f"break {item['id']}"),
            )
        )
    scenarios = {}
    scen_dir = folder / "scenarios"
    if scen_dir.is_dir():
        for file in sorted(scen_dir.glob("*.json")):
            scenarios[f"scenarios/{file.name}"] = file.read_text(encoding="utf-8")
    text = (
        (folder / "rein.py").read_text(encoding="utf-8") if (folder / "rein.py").is_file() else ""
    )
    return Step(
        module=module,
        number=int(data["number"]),
        title=str(data["title"]),
        lines_after=int(data["lines_after"]),
        chunks=chunks,
        setup=list(check.get("setup", [])),
        argv=[str(arg) for arg in check["argv"]],
        expected=str(check["expected"]),
        breaks=breaks,
        runs_in_browser=bool(data.get("runs_in_browser", True)),
        path=folder,
        scenarios=scenarios,
        text=text,
        goal=str(data.get("goal", "")),
        theory=str(data.get("theory", "")),
        requires_python=str(data.get("requires_python", "")),
        size=str(data.get("size", "")),
        explain=str(check.get("explain", "")),
        stdin=_stdin(check, "checkpoint"),
        local=_local(check, "checkpoint"),
    )


def _stdin(item: dict[str, Any], where: str) -> list[str]:
    """The run's standard input, one entry per line the learner types (BP-4.0 §2)."""
    lines = item.get("stdin", [])
    if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
        raise StepError(f"{where}: stdin must be a list of lines")
    return list(lines)


def _local(item: dict[str, Any], where: str) -> bool:
    """`local: true` runs under CPython only, on the learner's machine (BP-4.0 §2)."""
    value = item.get("local", False)
    if not isinstance(value, bool):
        raise StepError(f"{where}: local must be true or false")
    return value


def load_shared(steps_dir: Path) -> dict[str, str]:
    shared = steps_dir / SHARED
    if not shared.is_dir():
        return {}
    return {file.stem: file.read_text(encoding="utf-8") for file in sorted(shared.glob("*.py"))}


def apply_change(step: Step, change: dict[str, Any]) -> tuple[dict[str, str], list[str]]:
    """The files and argv a break runs with: the step's own, with one change."""
    files = {"rein.py": step.text, **step.scenarios}
    argv = list(step.argv)
    if "script" in change:
        spec = change["script"]
        files[spec["path"]] = json.dumps(spec["json"], indent=1, ensure_ascii=False) + "\n"
    elif "patch" in change:
        files["rein.py"] = apply_diff(step.text, parse_diff(change["patch"]["diff"], step.module))
    else:
        argv = [str(arg) for arg in change["argv"]]
    return files, argv


def expected_error(expected: str) -> str | None:
    if expected.startswith("error: ") and "\n" not in expected.strip():
        return expected[len("error: ") :].strip()
    return None


def error_name_from_stderr(stderr: str) -> str:
    lines = [line for line in stderr.strip().splitlines() if line.strip()]
    if not lines:
        return "SystemExit"
    last = lines[-1]
    return last.split(":", 1)[0].strip()


def run_cpython(
    files: dict[str, str],
    setup: dict[str, str],
    setup_names: list[str],
    argv: list[str],
    stdin: list[str] | None = None,
) -> Outcome:
    stdin_text = "".join(f"{line}\n" for line in stdin or [])
    with tempfile.TemporaryDirectory(prefix="rein-step-") as scratch:
        work = Path(scratch)
        for path, text in files.items():
            target = work / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        env = {
            **os.environ,
            "PYTHONHASHSEED": "0",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONIOENCODING": "utf-8",
        }
        for name in setup_names:
            (work / f"{name}.py").write_text(setup[name], encoding="utf-8")
            done = subprocess.run(
                [sys.executable, f"{name}.py"],
                cwd=work,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                input="",
                timeout=RUN_TIMEOUT,
                check=False,
            )
            if done.returncode != 0:
                return Outcome(done.stdout, error_name_from_stderr(done.stderr))
        completed = subprocess.run(
            [sys.executable, "rein.py", *argv],
            cwd=work,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            input=stdin_text,
            timeout=RUN_TIMEOUT,
            check=False,
        )
    error = "" if completed.returncode == 0 else error_name_from_stderr(completed.stderr)
    return Outcome(completed.stdout, error)


def matches(outcome: Outcome, expected: str) -> bool:
    name = expected_error(expected)
    if name is not None:
        return outcome.stdout == "" and outcome.error == name
    return outcome.stdout == expected and outcome.error == ""


def first_difference(left: str, right: str) -> str:
    a, b = left.split("\n"), right.split("\n")
    for index in range(max(len(a), len(b))):
        x = a[index] if index < len(a) else "<missing>"
        y = b[index] if index < len(b) else "<missing>"
        if x != y:
            return f"line {index + 1}: got {x!r}, expected {y!r}"
    return "the outputs differ"


def check_pyodide(
    jobs: list[dict[str, Any]], pyodide_dir: Path, report: list[Problem]
) -> list[dict[str, Any]] | None:
    # The Pyodide setup (node, the pinned install) is shared with check_katas.
    check_katas = _katas()

    node = shutil.which("node")
    if node is None:
        report.append(Problem(display(pyodide_dir), 0, "pyodide runner: node is not on PATH"))
        return None
    if not (pyodide_dir / "pyodide.mjs").is_file():
        report.append(
            Problem(
                display(pyodide_dir), 0, "pyodide runner: Pyodide is not installed (run npm ci)"
            )
        )
        return None
    with tempfile.TemporaryDirectory(prefix="rein-pyodide-") as scratch:
        work = Path(scratch)
        result_path = work / "result.json"
        request = {
            "pyodideDir": str(pyodide_dir),
            "hxshell": str(HXSHELL),
            "runner": RUNNER,
            "result": str(result_path),
            "jobs": jobs,
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
                timeout=check_katas.PYODIDE_TIMEOUT,
                check=False,
            )
        except subprocess.TimeoutExpired:
            report.append(Problem(display(pyodide_dir), 0, "pyodide runner: timed out"))
            return None
        if not result_path.is_file():
            tail = (completed.stdout + completed.stderr).strip()[-300:] or "no output"
            report.append(
                Problem(
                    display(pyodide_dir),
                    0,
                    f"pyodide runner wrote no result (exit {completed.returncode}): {tail}",
                )
            )
            return None
        data: list[dict[str, Any]] = json.loads(result_path.read_text(encoding="utf-8"))
    if len(data) != len(jobs):
        report.append(
            Problem(display(pyodide_dir), 0, "pyodide runner: result count differs from the jobs")
        )
        return None
    for job, row in zip(jobs, data, strict=True):
        if "error_python" in row:
            report.append(
                Problem(
                    display(pyodide_dir),
                    0,
                    f"pyodide runner could not run {job['name']}: {row['error_python']}",
                )
            )
            return None
    return data


def command_text(argv: list[str]) -> str:
    """The command as the book prints it: python rein.py, arguments in double quotes when needed."""
    return " ".join(["python", "rein.py"] + [f'"{arg}"' if " " in arg else arg for arg in argv])


def unreproduced(
    label: str, command: str, cpython: Outcome, browser: Outcome, refused: list[str]
) -> str:
    """The message for a browser run that differs from CPython: the command, and local."""
    text = (
        f"{label}: the browser run of `{command}` differs from CPython: "
        f"cpython={cpython.stdout!r}/{cpython.error!r} "
        f"pyodide={browser.stdout!r}/{browser.error!r}"
    )
    if refused:
        names = ", ".join(f"`{c}`" for c in refused)
        text += f"; the browser refused {names} (not available in the browser)"
    return text + "; if the run needs the learner's machine, mark it `local: true`"


def run(
    steps_dir: Path, course: Path | None, pyodide: bool = False, pyodide_dir: Path | None = None
) -> tuple[list[Problem], int, int, int, bool, int]:
    """Returns (problems, steps, breaks, checked_in_browser, pyodide_ran, local_runs)."""
    problems: list[Problem] = []
    if sys.version_info < PYTHON_MIN:
        problems.append(
            Problem(
                "tools/check_steps.py", 0, f"needs Python {PYTHON_MIN[0]}.{PYTHON_MIN[1]} or newer"
            )
        )
        return problems, 0, 0, 0, False, 0
    order = module_order(course, steps_dir, problems)
    shared = load_shared(steps_dir)
    steps: list[Step] = []
    for module in order:
        step = load_step(steps_dir / module, problems)
        if step is not None:
            steps.append(step)
    previous = ""
    good: list[Step] = []
    for step in steps:
        before = len(problems)
        try:
            built = build(previous, step.chunks)
        except ChunkError as exc:
            bad = next((c for c in step.chunks if _fails(previous, step.chunks, c)), step.chunks[0])
            problems.append(Problem(step.shown, 0, f"chunk {bad.id} does not apply: {exc}"))
            previous = ""
            continue
        if built != step.text:
            problems.append(
                Problem(
                    display(step.path / "rein.py"),
                    0,
                    f"the chunks give a different file: {first_difference(built, step.text)}",
                )
            )
        if len(step.text.splitlines()) != step.lines_after:
            problems.append(
                Problem(
                    step.shown,
                    0,
                    f"rein.py has {len(step.text.splitlines())} lines, "
                    f"lines_after says {step.lines_after}",
                )
            )
        check_outcome = run_cpython(
            {"rein.py": step.text, **step.scenarios}, shared, step.setup, step.argv, step.stdin
        )
        if not matches(check_outcome, step.expected):
            problems.append(
                Problem(
                    step.shown,
                    0,
                    f"checkpoint output differs: {describe(check_outcome, step.expected)}",
                )
            )
        for brk in step.breaks:
            try:
                files, argv = apply_change(step, brk.change)
            except ChunkError as exc:
                problems.append(
                    Problem(step.shown, 0, f"break {brk.id} change does not apply: {exc}")
                )
                continue
            outcome = run_cpython(files, shared, step.setup, argv, brk.stdin)
            if not matches(outcome, brk.expected):
                problems.append(
                    Problem(
                        step.shown,
                        0,
                        f"break {brk.id} output differs: {describe(outcome, brk.expected)}",
                    )
                )
            if outcome.stdout == check_outcome.stdout and outcome.error == check_outcome.error:
                problems.append(
                    Problem(step.shown, 0, f"break {brk.id} gives the checkpoint's output")
                )
        if len(problems) == before:
            good.append(step)
        previous = step.text
    breaks = sum(len(step.breaks) for step in steps)
    local_runs = sum(int(step.local) + sum(int(brk.local) for brk in step.breaks) for step in good)
    in_browser = [step for step in good if step.runs_in_browser]
    ran = False
    if pyodide and in_browser:
        jobs: list[dict[str, Any]] = []
        meta: list[tuple[Step, str, Break | None]] = []
        for step in in_browser:
            if not step.local:
                jobs.append(
                    _job(
                        step,
                        {"rein.py": step.text, **step.scenarios},
                        step.argv,
                        shared,
                        f"{step.module}-check",
                        step.stdin,
                    )
                )
                meta.append((step, "check", None))
            for brk in step.breaks:
                if brk.local:
                    continue  # the learner's machine runs it; CPython did (above)
                try:
                    files, argv = apply_change(step, brk.change)
                except ChunkError:
                    continue  # reported above
                jobs.append(_job(step, files, argv, shared, f"{step.module}-{brk.id}", brk.stdin))
                meta.append((step, "break", brk))
        rows = check_pyodide(jobs, pyodide_dir or check_katas_dir(), problems)
        if rows is not None:
            ran = True
            for (step, kind, target), row in zip(meta, rows, strict=True):
                outcome = Outcome(row.get("stdout", ""), row.get("error", ""))
                cpython = run_cpython_for(step, kind, target, shared)
                if same_output(outcome, cpython) is False:
                    label = "checkpoint" if target is None else f"break {target.id}"
                    argv = step.argv if target is None else apply_change(step, target.change)[1]
                    problems.append(
                        Problem(
                            step.shown,
                            0,
                            unreproduced(
                                label,
                                command_text(argv),
                                cpython,
                                outcome,
                                [str(c) for c in row.get("refused", [])],
                            ),
                        )
                    )
    return problems, len(good), breaks, len(in_browser), ran, local_runs


ERRNO = re.compile(r"\[Errno \d+\]")


def same_output(left: Outcome, right: Outcome) -> bool:
    """Equal stdout and error name.

    Pyodide numbers errno differently from CPython ([Errno 44] for a missing file, where
    CPython gives 2), so the number inside [Errno N] is not compared.
    """
    return (
        ERRNO.sub("[Errno N]", left.stdout) == ERRNO.sub("[Errno N]", right.stdout)
        and left.error == right.error
    )


def _fails(previous: str, chunks: list[Chunk], chunk: Chunk) -> bool:
    text = previous
    for item in chunks:
        for hunk in item.hunks:
            try:
                text = apply_diff(text, hunk.lines)
            except ChunkError:
                return item is chunk
    return False


def describe(outcome: Outcome, expected: str) -> str:
    name = expected_error(expected)
    if name is not None:
        return (
            f"expected error {name}, got stdout {outcome.stdout!r} "
            f"error {outcome.error or 'none'!r}"
        )
    return f"{first_difference(outcome.stdout, expected)} (error {outcome.error or 'none'!r})"


def _job(
    step: Step,
    files: dict[str, str],
    argv: list[str],
    shared: dict[str, str],
    name: str,
    stdin: list[str],
) -> dict[str, Any]:
    all_files = {**files, **{f"{n}.py": shared[n] for n in step.setup}}
    return {
        "name": name,
        "files": all_files,
        "setup": list(step.setup),
        "argv": argv,
        "stdin": "".join(f"{line}\n" for line in stdin),
    }


def run_cpython_for(step: Step, kind: str, brk: Break | None, shared: dict[str, str]) -> Outcome:
    if kind == "check" or brk is None:
        return run_cpython(
            {"rein.py": step.text, **step.scenarios}, shared, step.setup, step.argv, step.stdin
        )
    files, argv = apply_change(step, brk.change)
    return run_cpython(files, shared, step.setup, argv, brk.stdin)


def module_order(course: Path | None, steps_dir: Path, problems: list[Problem]) -> list[str]:
    present = (
        sorted(p.name for p in steps_dir.iterdir() if p.is_dir() and p.name != SHARED)
        if steps_dir.is_dir()
        else []
    )
    if course is None:
        return present
    try:
        data = json.loads(course.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        problems.append(Problem(display(course), 0, f"cannot read course.json: {exc}"))
        return present
    path = data.get("path", [])
    known = [module for module in path if module in present]
    missing = [module for module in present if module not in path]
    return known + missing


def _katas() -> ModuleType:
    """check_katas, imported as tools.check_katas, or as a script module next to this file."""
    try:
        return importlib.import_module("tools.check_katas")
    except ImportError:
        return importlib.import_module("check_katas")


def check_katas_dir() -> Path:
    return Path(_katas().PYODIDE_DIR)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the Rein build steps under steps/.")
    parser.add_argument("--steps", type=Path, default=DEFAULT_STEPS, help="steps directory")
    parser.add_argument("--course", default=str(DEFAULT_COURSE), help="course.json path, or 'none'")
    parser.add_argument(
        "--pyodide", action="store_true", help="also run the browser steps in Pyodide"
    )
    args = parser.parse_args(argv)
    if not args.steps.is_dir() or not any(
        p.is_dir() and p.name != SHARED for p in args.steps.iterdir()
    ):
        print("check_steps: 0 steps (no steps/ folder yet)")
        return 0
    course = None if args.course == "none" else Path(args.course)
    problems, steps, breaks, in_browser, ran, local = run(args.steps, course, args.pyodide)
    for problem in problems:
        print(problem.render())
    if problems:
        print(f"check_steps: FAILED ({len(problems)} problems)")
        return 1
    if ran:
        print(f"check_steps: {steps} steps OK ({breaks} breaks, {local} local; "
              "CPython and Pyodide agree)")
    else:
        print(f"check_steps: {steps} steps OK ({breaks} breaks, {local} local; CPython)")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(REPO_ROOT / "tools"))
    raise SystemExit(main())
