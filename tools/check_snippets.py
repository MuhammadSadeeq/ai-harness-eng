"""check_snippets: runs the code of every <pre data-run> block in the built site.

Usage: check_snippets.py [PATH ...]   (files or directories; default: site/, skipping site/vendor/)

Each snippet's next element sibling must be <pre data-output> (unless data-raises is set),
and its code may import only standard-library modules. Problems print as ``path:line: message``.
"""

from __future__ import annotations

import argparse
import ast
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATHS = (REPO_ROOT / "site",)
DEFAULT_TIMEOUT = 10.0
VOID_TAGS = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)


@dataclass
class Element:
    tag: str
    attrs: dict[str, str | None]
    line: int
    children: list[Element | str] = field(default_factory=list)

    def text(self) -> str:
        parts = [child if isinstance(child, str) else child.text() for child in self.children]
        return "".join(parts)


class _TreeBuilder(HTMLParser):
    """A minimal DOM: elements keep their start-tag line and their child nodes in order."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Element("#document", {}, 1)
        self._stack: list[Element] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        element = Element(tag, dict(attrs), self.getpos()[0])
        self._stack[-1].children.append(element)
        if tag not in VOID_TAGS:
            self._stack.append(element)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self._stack) - 1, 0, -1):
            if self._stack[index].tag == tag:
                del self._stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self._stack[-1].children.append(data)


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


@dataclass
class Snippet:
    line: int
    code: str
    raises: str | None
    timeout: float
    output: str | None


@dataclass
class Report:
    problems: list[Problem] = field(default_factory=list)
    snippets_ok: int = 0
    files: int = 0

    def last_line(self) -> str:
        if self.problems:
            return f"check_snippets: FAILED ({len(self.problems)} problems)"
        return f"check_snippets: {self.snippets_ok} snippets OK in {self.files} files"


def run(paths: list[Path]) -> Report:
    """Check every snippet in the given files and directories."""
    report = Report()
    for file in _collect(paths, report):
        text = file.read_text(encoding="utf-8", errors="replace")
        snippets, parse_problems = find_snippets(text, _display(file))
        report.problems.extend(parse_problems)
        if snippets:
            report.files += 1
        for snippet in snippets:
            problems = check_snippet(snippet, _display(file))
            if problems:
                report.problems.extend(problems)
            else:
                report.snippets_ok += 1
    return report


def find_snippets(text: str, display: str) -> tuple[list[Snippet], list[Problem]]:
    """Return every ``<pre data-run>`` in ``text`` with its expected output."""
    builder = _TreeBuilder()
    builder.feed(text)
    builder.close()
    snippets: list[Snippet] = []
    problems: list[Problem] = []

    def walk(parent: Element) -> None:
        for index, child in enumerate(parent.children):
            if not isinstance(child, Element):
                continue
            if child.tag == "pre" and "data-run" in child.attrs:
                following = next(
                    (node for node in parent.children[index + 1 :] if isinstance(node, Element)),
                    None,
                )
                snippet, problem = _build_snippet(child, following, display)
                if problem is not None:
                    problems.append(problem)
                if snippet is not None:
                    snippets.append(snippet)
            walk(child)

    walk(builder.root)
    return snippets, problems


def _build_snippet(
    element: Element, following: Element | None, display: str
) -> tuple[Snippet | None, Problem | None]:
    raises = element.attrs.get("data-raises")
    if "data-raises" in element.attrs and not raises:
        return None, Problem(display, element.line, "data-raises needs an exception name")
    timeout = DEFAULT_TIMEOUT
    if "data-timeout" in element.attrs:
        try:
            timeout = float(element.attrs["data-timeout"] or "")
        except ValueError:
            timeout = 0.0
        if timeout <= 0:
            return None, Problem(display, element.line, "data-timeout must be a positive number")
    output: str | None = None
    if following is not None and following.tag == "pre" and "data-output" in following.attrs:
        output = _normalize(_pre_text(following))
    snippet = Snippet(
        line=element.line,
        code=_pre_text(element),
        raises=raises,
        timeout=timeout,
        output=output,
    )
    return snippet, None


def check_snippet(snippet: Snippet, display: str) -> list[Problem]:
    """Return the problems of one snippet (empty when it passes)."""
    problems: list[Problem] = []

    def fail(message: str) -> None:
        problems.append(Problem(display, snippet.line, message))

    import_problems = _import_problems(snippet.code)
    if import_problems:
        for message in import_problems:
            fail(message)
        return problems
    if snippet.output is None and snippet.raises is None:
        fail("missing <pre data-output> directly after this snippet")
    result = _execute(snippet.code, snippet.timeout)
    if result is None:
        fail(f"timed out after {snippet.timeout:g} s")
        return problems
    last_error = _last_nonblank_line(result.stderr)
    if snippet.raises is None:
        if result.returncode != 0:
            fail(f"exited with status {result.returncode}; last stderr line: {last_error!r}")
    else:
        if result.returncode == 0:
            fail(f"expected {snippet.raises} but the snippet exited normally")
        elif not (last_error == snippet.raises or last_error.startswith(snippet.raises + ":")):
            fail(f"expected {snippet.raises} as the last stderr line, got {last_error!r}")
    if snippet.output is not None:
        actual = _normalize(result.stdout)
        if actual != snippet.output:
            fail(f"output differs: expected {_short(snippet.output)}, got {_short(actual)}")
    return problems


def _import_problems(code: str) -> list[str]:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"snippet is not valid Python: {exc.msg}"]
    modules: set[str] = set()
    problems: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level or node.module is None:
                problems.append(f"relative import (level {node.level}) is not allowed")
            else:
                modules.add(node.module.partition(".")[0])
    for name in sorted(modules):
        if name not in sys.stdlib_module_names:
            problems.append(f"non-stdlib import: {name}")
    return problems


def _execute(code: str, timeout: float) -> subprocess.CompletedProcess[str] | None:
    with tempfile.TemporaryDirectory(prefix="snippet-") as scratch:
        try:
            return subprocess.run(
                [sys.executable, "-I", "-X", "utf8", "-c", code],
                cwd=scratch,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return None


def _pre_text(element: Element) -> str:
    text = element.text()
    return text[1:] if text.startswith("\n") else text


def _normalize(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _last_nonblank_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def _short(text: str, limit: int = 120) -> str:
    return repr(text if len(text) <= limit else text[:limit] + "...")


def _collect(paths: list[Path], report: Report) -> list[Path]:
    files: list[Path] = []
    for path in paths or list(DEFAULT_PATHS):
        if not path.exists():
            report.problems.append(Problem(_display(path), 0, "no such file or directory"))
            continue
        candidates = [path] if path.is_file() else sorted(path.rglob("*.html"))
        files.extend(file for file in candidates if not _is_vendor(file))
    return files


def _is_vendor(path: Path) -> bool:
    return any(parent.name == "vendor" and parent.parent.name == "site" for parent in path.parents)


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the <pre data-run> snippets of the site.")
    parser.add_argument("paths", nargs="*", type=Path, help="files or directories")
    args = parser.parse_args(argv)
    report = run(args.paths)
    for problem in report.problems:
        print(problem.render())
    print(report.last_line())
    return 1 if report.problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
