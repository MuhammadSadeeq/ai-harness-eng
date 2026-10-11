"""Tests for site/assets/py/hxshell.py, the stand-in for subprocess.run (BP-4.0 §1).

Under CPython the tests call run() directly: a python file runs in this interpreter as the
browser runs it, so each rule is checked without a process. install() is a no-op here.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
NOT_AVAILABLE = "not available in the browser. Run this step on your machine to use it."


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "hxshell", ROOT / "site" / "assets" / "py" / "hxshell.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hx = _load()


@pytest.fixture(autouse=True)
def _clean_refusals() -> None:
    hx.clear_refused()


def _write(folder: Path, name: str, text: str) -> Path:
    path = folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_a_file_runs_with_its_arguments_and_folder(tmp_path: Path) -> None:
    _write(
        tmp_path,
        "show.py",
        "import os, sys\nprint(sys.argv[1:])\nprint(os.path.isdir(os.getcwd()))\n",
    )
    done = hx.run(
        "python show.py one 'two words'",
        shell=True,
        cwd=str(tmp_path),
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0
    assert done.stdout.splitlines()[0] == "['one', 'two words']"
    assert done.stderr == ""


def test_a_file_in_a_subfolder_runs_from_its_own_folder(tmp_path: Path) -> None:
    _write(
        tmp_path, "sub/helper.py", "from pathlib import Path\nprint(Path(__file__).parent.name)\n"
    )
    _write(tmp_path, "sub/main.py", "import helper\n")
    done = hx.run(
        ["python", "-u", "sub/main.py"], cwd=str(tmp_path), capture_output=True, text=True
    )
    assert done.returncode == 0, done.stderr
    assert done.stdout == "sub\n", "the script's own folder is first on sys.path"


def test_a_module_edited_between_two_runs_is_imported_afresh(tmp_path: Path) -> None:
    _write(tmp_path, "calc.py", "def add(a, b):\n    return a - b\n")
    _write(tmp_path, "test_calc.py", "from calc import add\nprint(add(2, 3))\n")
    first = hx.run(
        "python test_calc.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True
    )
    _write(tmp_path, "calc.py", "def add(a, b):\n    return a + b\n")
    second = hx.run(
        "python test_calc.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True
    )
    assert first.stdout == "-1\n"
    assert second.stdout == "5\n", "the edited calc.py is read by the next run"
    assert "calc" not in sys.modules, "the run's own imports are removed afterwards"


def test_stdout_and_stderr_stay_apart_and_join_as_run_command_joins_them(tmp_path: Path) -> None:
    _write(
        tmp_path, "both.py", "import sys\nprint('out line')\nprint('err line', file=sys.stderr)\n"
    )
    done = hx.run("python both.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True)
    assert done.stdout == "out line\n"
    assert done.stderr == "err line\n"
    assert (done.stdout + done.stderr).strip() == "out line\nerr line"


@pytest.mark.parametrize(
    ("source", "code", "stderr_has"),
    [
        ("raise SystemExit()\n", 0, ""),
        ("raise SystemExit(None)\n", 0, ""),
        ("raise SystemExit(3)\n", 3, ""),
        ("raise SystemExit('boom')\n", 1, "boom"),
        ("raise ValueError('bad')\n", 1, "ValueError: bad"),
        ("def broken(:\n", 1, "SyntaxError"),
    ],
)
def test_exit_codes_match_a_real_process(
    tmp_path: Path, source: str, code: int, stderr_has: str
) -> None:
    _write(tmp_path, "exit.py", source)
    done = hx.run("python exit.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == code
    assert stderr_has in done.stderr
    if code == 1 and "ValueError" in stderr_has:
        assert done.stderr.startswith("Traceback (most recent call last):")
        assert done.stderr.rstrip().splitlines()[-1] == "ValueError: bad"


def test_a_missing_file_exits_two(tmp_path: Path) -> None:
    done = hx.run(
        "python nothing.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True
    )
    assert done.returncode == 2
    assert "can't open file" in done.stderr


def test_input_reaches_input_and_the_prompt_is_printed_without_an_echo(tmp_path: Path) -> None:
    _write(tmp_path, "ask.py", "answer = input('allow? [y/N] ')\nprint('got', answer)\n")
    done = hx.run(
        "python ask.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True, input="y\n"
    )
    assert done.stdout == "allow? [y/N] got y\n", (
        "the prompt is on stdout; the answer is not echoed"
    )


def test_input_runs_out_as_it_does_for_a_pipe(tmp_path: Path) -> None:
    _write(tmp_path, "ask.py", "print(input())\n")
    done = hx.run(
        "python ask.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True, input=""
    )
    assert done.returncode == 1
    assert "EOFError" in done.stderr


def test_check_true_raises_on_a_failing_run(tmp_path: Path) -> None:
    _write(tmp_path, "bad.py", "raise SystemExit(4)\n")
    with pytest.raises(subprocess.CalledProcessError) as caught:
        hx.run(
            "python bad.py",
            shell=True,
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
            check=True,
        )
    assert caught.value.returncode == 4


def test_check_true_passes_a_good_run(tmp_path: Path) -> None:
    _write(tmp_path, "good.py", "print('fine')\n")
    done = hx.run(
        "python good.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True, check=True
    )
    assert done.stdout == "fine\n"


def test_bytes_come_back_without_text(tmp_path: Path) -> None:
    _write(tmp_path, "b.py", "print('x')\n")
    done = hx.run("python b.py", shell=True, cwd=str(tmp_path), capture_output=True)
    assert done.stdout == b"x\n"


def test_timeout_is_accepted_and_not_enforced(tmp_path: Path) -> None:
    _write(tmp_path, "quick.py", "print('done')\n")
    done = hx.run(
        "python quick.py",
        shell=True,
        cwd=str(tmp_path),
        capture_output=True,
        text=True,
        timeout=0.001,
    )
    assert done.stdout == "done\n"


REFUSED: list[tuple[Any, Any]] = [
    ("python -c 'print(1)'", "python -c 'print(1)'"),
    ("python -m pytest", "python -m pytest"),
    ("ls", "ls"),
    ("python test_calc.py && echo ok", "python test_calc.py && echo ok"),
    ("python test_calc.py; rm -rf build", "python test_calc.py; rm -rf build"),
    ("python test_calc.py | cat", "python test_calc.py | cat"),
    ("python test_calc.py > out.txt", "python test_calc.py > out.txt"),
    ("echo $HOME", "echo $HOME"),
    ("echo `date`", "echo `date`"),
    ("python test_calc.py\nls", "python test_calc.py\nls"),
    ("", ""),
    (["rm", "-rf", "build"], ["rm", "-rf", "build"]),
]


@pytest.mark.parametrize(("command", "recorded"), REFUSED)
def test_every_other_command_is_refused_with_exit_127(command: Any, recorded: Any) -> None:
    done = hx.run(command, shell=True, capture_output=True, text=True)
    assert done.returncode == hx.REFUSED_EXIT == 127
    assert done.stdout == ""
    assert NOT_AVAILABLE in done.stderr
    assert hx.refused_commands() == [hx.refused_commands()[0]]


def test_the_refusal_names_the_program(tmp_path: Path) -> None:
    done = hx.run("ls", shell=True, cwd=str(tmp_path), capture_output=True, text=True)
    assert done.stderr == f"ls: {NOT_AVAILABLE}\n"
    done = hx.run(["rm", "-rf", "build"], capture_output=True, text=True)
    assert done.stderr.startswith("rm: ")


def test_refused_commands_are_listed_in_order() -> None:
    hx.run("ls", shell=True, capture_output=True, text=True)
    hx.run("python x.py && y", shell=True, capture_output=True, text=True)
    assert hx.refused_commands() == ["ls", "python x.py && y"]


def test_check_true_raises_on_a_refusal() -> None:
    with pytest.raises(subprocess.CalledProcessError) as caught:
        hx.run("ls", shell=True, capture_output=True, text=True, check=True)
    assert caught.value.returncode == 127


def test_state_is_restored_after_a_run_that_raised(tmp_path: Path) -> None:
    _write(tmp_path, "boom.py", "import json\nraise KeyError('gone')\n")
    before_path = list(sys.path)
    before_argv = list(sys.argv)
    before_cwd = Path.cwd()
    before_modules = set(sys.modules)
    done = hx.run("python boom.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True)
    assert done.returncode == 1
    assert sys.path == before_path
    assert sys.argv == before_argv
    assert Path.cwd() == before_cwd
    assert set(sys.modules) == before_modules


def test_install_does_nothing_under_cpython() -> None:
    original: Callable[..., Any] = subprocess.run
    hx.install()
    assert subprocess.run is original, "install() replaces subprocess.run only under Pyodide"


def test_stdin_and_stdout_are_put_back_after_a_run(tmp_path: Path) -> None:
    _write(tmp_path, "quiet.py", "print('inside')\n")
    saved_out, saved_in = sys.stdout, sys.stdin
    hx.run("python quiet.py", shell=True, cwd=str(tmp_path), capture_output=True, text=True)
    assert sys.stdout is saved_out
    assert sys.stdin is saved_in
