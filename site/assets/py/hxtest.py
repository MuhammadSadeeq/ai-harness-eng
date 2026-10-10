"""hxtest: the HARNESSED stdlib kata runner (DECISIONS D-016).

Runs the plain-assert tests of one kata file using the standard library only,
so the same file runs under CPython (pytest) and in the browser (Pyodide).

A test may be an ``async def test_*``: it is awaited. Under CPython, run() starts
an event loop for each file (asyncio.run). In the browser, the page awaits
run_async() with runPythonAsync, which uses Pyodide's own event loop; run() must
not be called there (Pyodide cannot run a loop synchronously).

Usage: python hxtest.py <test_file.py> [--json]
"""

from __future__ import annotations

import argparse
import ast
import asyncio
import contextlib
import importlib.abc
import importlib.util
import inspect
import io
import json
import os
import sys
from collections.abc import Sequence
from importlib.machinery import ModuleSpec
from types import FrameType, ModuleType, TracebackType
from typing import TypedDict


class TestResult(TypedDict):
    name: str
    outcome: str
    message: str


class RunResult(TypedDict):
    tests: list[TestResult]
    passed: int
    failed: int
    errors: int


TEST_DEFS = (ast.FunctionDef, ast.AsyncFunctionDef)
COLLECTION = "<collection>"
MODULE_NAME = "hxtest_test_module"
KATA_MODULE = "kata"
_OPS: dict[type[ast.cmpop], str] = {
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
    ast.Is: "is",
    ast.IsNot: "is not",
    ast.In: "in",
    ast.NotIn: "not in",
}


class _SourceLoader(importlib.abc.Loader):
    """Runs a .py file from its source text.

    Bytecode caches are never read or written for kata files. A cached .pyc is
    validated only by source mtime (seconds) and size, so an edit that keeps the
    size and lands in the same second would run the old code.
    """

    def __init__(self, location: str) -> None:
        self.location = location

    def exec_module(self, module: ModuleType) -> None:
        with open(self.location, encoding="utf-8") as handle:
            source = handle.read()
        code = compile(source, self.location, "exec", dont_inherit=True)
        exec(code, module.__dict__)


class _KataFinder:
    """Finds ``kata`` in the test file's own folder, from source (see _SourceLoader)."""

    def __init__(self, directory: str) -> None:
        self.directory = directory

    def find_spec(
        self,
        fullname: str,
        path: Sequence[str] | None = None,
        target: ModuleType | None = None,
    ) -> ModuleSpec | None:
        if fullname != KATA_MODULE:
            return None
        location = os.path.join(self.directory, "kata.py")
        if not os.path.isfile(location):
            return None
        return importlib.util.spec_from_file_location(
            fullname, location, loader=_SourceLoader(location)
        )


def run(test_path: str) -> RunResult:
    """Run every top-level ``test_*`` function of ``test_path`` (CPython: starts a loop)."""
    return asyncio.run(run_async(test_path))


async def run_async(test_path: str) -> RunResult:
    """Run every top-level ``test_*`` function of ``test_path`` in source order.

    Async tests are awaited.
    """
    path = os.path.abspath(test_path)
    directory = os.path.dirname(path)
    sys.modules.pop(KATA_MODULE, None)
    saved_path = list(sys.path)
    sys.path.insert(0, directory)
    finder = _KataFinder(directory)
    sys.meta_path.insert(0, finder)
    results: list[TestResult] = []
    try:
        try:
            module, source, tree = _load(path)
        except (Exception, SystemExit) as exc:
            results.append({"name": COLLECTION, "outcome": "error", "message": _describe(exc)})
            return _summarize(results)
        for node in tree.body:
            if isinstance(node, TEST_DEFS) and node.name.startswith("test_"):
                fn = getattr(module, node.name, None)
                results.append(await _run_one(node.name, fn, path, source, tree))
    finally:
        sys.meta_path.remove(finder)
        sys.path[:] = saved_path
        sys.modules.pop(MODULE_NAME, None)
        sys.modules.pop(KATA_MODULE, None)
    return _summarize(results)


def _load(path: str) -> tuple[ModuleType, str, ast.Module]:
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    tree = ast.parse(source, filename=path)
    spec = importlib.util.spec_from_file_location(
        MODULE_NAME, path, loader=_SourceLoader(path)
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module, source, tree


async def _run_one(name: str, fn: object, path: str, source: str, tree: ast.Module) -> TestResult:
    if not callable(fn):
        return {"name": name, "outcome": "error", "message": "TypeError: test is not callable"}
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            outcome = fn()
            if inspect.isawaitable(outcome):  # an async def test: wait for it
                await outcome
    except AssertionError as exc:
        message = _assert_message(exc, path, source, tree)
        return {"name": name, "outcome": "failed", "message": message}
    except (Exception, SystemExit) as exc:
        return {"name": name, "outcome": "error", "message": _describe(exc)}
    return {"name": name, "outcome": "passed", "message": ""}


def _describe(exc: BaseException) -> str:
    text = str(exc)
    return f"{type(exc).__name__}: {text}" if text else type(exc).__name__


def _assert_message(exc: AssertionError, path: str, source: str, tree: ast.Module) -> str:
    if exc.args and str(exc.args[0]):
        return str(exc.args[0])
    lineno, frame = _innermost_test_frame(exc.__traceback__, path)
    if frame is None:
        return "assertion failed"
    node = _assert_at(tree, lineno)
    if node is None:
        return "assertion failed"
    if isinstance(node.test, ast.Compare) and len(node.test.ops) == 1:
        rendered = _render_compare(node.test, frame)
        if rendered is not None:
            return rendered
    segment = ast.get_source_segment(source, node)
    return segment if segment else "assertion failed"


def _innermost_test_frame(
    traceback: TracebackType | None, path: str
) -> tuple[int, FrameType | None]:
    lineno = 0
    frame: FrameType | None = None
    current = traceback
    while current is not None:
        if os.path.abspath(current.tb_frame.f_code.co_filename) == path:
            lineno = current.tb_lineno
            frame = current.tb_frame
        current = current.tb_next
    return lineno, frame


def _assert_at(tree: ast.Module, lineno: int) -> ast.Assert | None:
    best: ast.Assert | None = None
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assert):
            continue
        end = node.end_lineno or node.lineno
        if node.lineno <= lineno <= end and (best is None or (end - node.lineno) < _span(best)):
            best = node
    return best


def _span(node: ast.Assert) -> int:
    return (node.end_lineno or node.lineno) - node.lineno


def _render_compare(compare: ast.Compare, frame: FrameType) -> str | None:
    op = _OPS.get(type(compare.ops[0]))
    if op is None:
        return None
    try:
        left = _evaluate(compare.left, frame)
        right = _evaluate(compare.comparators[0], frame)
    except Exception:
        return None
    return f"assert {left!r} {op} {right!r}"


def _evaluate(node: ast.expr, frame: FrameType) -> object:
    expression = ast.fix_missing_locations(ast.Expression(body=node))
    code = compile(expression, "<assert>", "eval")
    return eval(code, frame.f_globals, dict(frame.f_locals))


def _summarize(results: list[TestResult]) -> RunResult:
    passed = sum(1 for test in results if test["outcome"] == "passed")
    failed = sum(1 for test in results if test["outcome"] == "failed")
    errors = sum(1 for test in results if test["outcome"] == "error")
    return {"tests": results, "passed": passed, "failed": failed, "errors": errors}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="hxtest", description="Run one HARNESSED kata test file (standard library only)."
    )
    parser.add_argument("test_file", help="the kata's test_kata.py")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    args = parser.parse_args(argv)
    result = run(args.test_file)
    if args.json:
        print(json.dumps(result))
    else:
        for test in result["tests"]:
            if test["outcome"] == "passed":
                print(f"PASS {test['name']}")
            else:
                label = "FAIL" if test["outcome"] == "failed" else "ERROR"
                print(f"{label} {test['name']}: {test['message']}")
        print(
            f"hxtest: {result['passed']} passed, {result['failed']} failed, "
            f"{result['errors']} errors"
        )
    return 0 if result["failed"] == 0 and result["errors"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
