"""The stand-in for subprocess.run in the browser (BP-4.0 §1, DECISIONS D-056).

Rein's commands call subprocess.run: run_command runs `python test_calc.py` through a
shell, and the checkpoints run the tests the same way. Pyodide cannot start a process,
so install() replaces subprocess.run with run() under Pyodide only
(sys.platform == "emscripten"); under CPython it does nothing.

run() runs `python <file>.py [args]` in this interpreter: the file runs with
runpy.run_path(..., run_name="__main__"), with the given folder as the working
directory and first on sys.path, with sys.argv set, with `input` as its standard
input, and with stdout and stderr captured apart. Afterwards the folder, sys.argv,
sys.path, the working directory, the streams and every module the run imported are
put back, so the next run imports an edited file afresh, as a real process would.

Anything else is refused: another program, -c and -m, a shell operator anywhere in
the command, a newline, an empty command. A refused command returns exit code 127,
empty stdout, and a stderr line that says the command is not available in the browser
and runs on the learner's own machine.

Not enforced: `timeout` is accepted, and nothing waits in the browser, so no run times
out. `env` is accepted and not used: a run sees the browser's own environment.
"""

from __future__ import annotations

import io
import os
import runpy
import shlex
import subprocess
import sys
import traceback
from collections.abc import Sequence
from typing import Any

PIPE = subprocess.PIPE
REFUSED_EXIT = 127
NOT_AVAILABLE = "not available in the browser. Run this step on your machine to use it."
SHELL_OPERATORS = frozenset(";&|`$<>()")
PROGRAMS = frozenset({"python", "python3"})

_refused: list[str] = []


def refused_commands() -> list[str]:
    """The commands refused since the last clear_refused(), in the order refused."""
    return list(_refused)


def clear_refused() -> None:
    _refused.clear()


def _in_pyodide() -> bool:
    return sys.platform == "emscripten"


def install() -> None:
    """Replaces subprocess.run under Pyodide. A no-op anywhere else."""
    if not _in_pyodide():
        return
    vars(subprocess)["run"] = run


def _command_text(args: str | Sequence[str]) -> str:
    if isinstance(args, str):
        return args
    return " ".join(str(arg) for arg in args)


def _words(args: str | Sequence[str]) -> list[str]:
    if isinstance(args, str):
        return shlex.split(args)
    return [str(arg) for arg in args]


def _is_python(program: str) -> bool:
    return os.path.basename(program) in PROGRAMS or program == sys.executable


def _parse(args: str | Sequence[str]) -> list[str] | None:
    """The argv of a command the stand-in runs: python [-u] <file>.py [args]; None if refused."""
    text = _command_text(args)
    if text.strip() == "" or "\n" in text or "\r" in text:
        return None
    if any(ch in SHELL_OPERATORS for ch in text):
        return None
    words = _words(args)
    if not words or not _is_python(words[0]):
        return None
    rest = words[1:]
    if rest and rest[0] == "-u":
        rest = rest[1:]
    if not rest or not rest[0].endswith(".py"):
        return None
    return rest


def _traceback_text(exc: BaseException, path: str) -> str:
    """The traceback a real process prints: its frames from the script on, then the error."""
    frames = traceback.extract_tb(exc.__traceback__)
    start = next((i for i, frame in enumerate(frames) if frame.filename == path), None)
    if start is None:
        return "".join(traceback.format_exception_only(type(exc), exc))
    lines = ["Traceback (most recent call last):\n"]
    lines += traceback.format_list(frames[start:])
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines)


def _run_file(path: str, args: list[str], cwd: str, stdin_text: str) -> tuple[int, str, str]:
    """Runs one file as a process would. Returns (exit code, stdout, stderr) and restores state."""
    full = os.path.abspath(os.path.join(cwd, path))  # before the chdir below
    if not os.path.isfile(full):
        message = f"python: can't open file '{full}': [Errno 2] No such file or directory\n"
        return 2, "", message
    out = io.StringIO()
    err = io.StringIO()
    saved_streams = (sys.stdin, sys.stdout, sys.stderr)
    saved_argv = sys.argv
    saved_path = list(sys.path)
    saved_cwd = os.getcwd()
    saved_bytecode = sys.dont_write_bytecode
    before = set(sys.modules)
    code = 0
    try:
        # As the book's run_command sets PYTHONDONTWRITEBYTECODE: a cached .pyc could hide an edit
        # made within the same second with the same size.
        sys.dont_write_bytecode = True
        os.chdir(cwd)
        sys.path.insert(0, os.path.dirname(full) or cwd)
        sys.argv = [path, *args]
        sys.stdin = io.StringIO(stdin_text)
        sys.stdout = out
        sys.stderr = err
        try:
            runpy.run_path(full, run_name="__main__")
        except SystemExit as exc:
            if exc.code is None:
                code = 0
            elif isinstance(exc.code, int):
                code = exc.code
            else:
                print(str(exc.code), file=err)
                code = 1
        except BaseException as exc:
            err.write(_traceback_text(exc, full))
            code = 1
    finally:
        sys.stdin, sys.stdout, sys.stderr = saved_streams
        sys.dont_write_bytecode = saved_bytecode
        sys.argv = saved_argv
        sys.path[:] = saved_path
        os.chdir(saved_cwd)
        for name in list(sys.modules):
            if name not in before:
                del sys.modules[name]
    return code, out.getvalue(), err.getvalue()


def run(
    args: str | Sequence[str],
    *,
    shell: bool = False,
    cwd: str | os.PathLike[str] | None = None,
    capture_output: bool = False,
    stdout: int | None = None,
    stderr: int | None = None,
    text: bool | None = None,
    encoding: str | None = None,
    input: str | bytes | None = None,
    env: dict[str, str] | None = None,
    timeout: float | None = None,
    check: bool = False,
) -> subprocess.CompletedProcess[Any]:
    """subprocess.run for Rein's commands: a python file runs; anything else is refused."""
    del shell, env, timeout  # accepted: nothing here starts a shell, reads env, or waits
    as_text = text is True or encoding is not None
    stdin_text = input.decode("utf-8") if isinstance(input, bytes) else (input or "")
    folder = os.fspath(cwd) if cwd is not None else os.getcwd()
    argv = _parse(args)
    if argv is None:
        _refused.append(_command_text(args))
        words = _words(args)
        word = words[0] if words else "(empty command)"
        out_text, err_text, code = "", f"{word}: {NOT_AVAILABLE}\n", REFUSED_EXIT
    else:
        code, out_text, err_text = _run_file(argv[0], argv[1:], folder, stdin_text)
    out_value: Any = None
    if capture_output or stdout == PIPE:
        out_value = out_text if as_text else out_text.encode("utf-8")
    else:
        sys.stdout.write(out_text)
    err_value: Any = None
    if capture_output or stderr == PIPE:
        err_value = err_text if as_text else err_text.encode("utf-8")
    else:
        sys.stderr.write(err_text)
    completed: subprocess.CompletedProcess[Any] = subprocess.CompletedProcess(
        args, code, out_value, err_value
    )
    if check and code != 0:
        raise subprocess.CalledProcessError(code, args, output=out_value, stderr=err_value)
    return completed
