"""The blank a from-memory kata starts from (hx-kata's memory mode).

The learner sees the names the kata's tests import from kata. Each is stubbed from the reference
solution: its header as written in the source (decorators, parameters, defaults, annotations), and a
body of `...`. No docstring and no hint is shown.

A header can name something the blank does not define or import: a type alias or a constant of the
solution. A name used only in an annotation is harmless once annotations are not evaluated, so the
blank starts with `from __future__ import annotations`. A name used anywhere else (a default, a base
class, a decorator) cannot be stubbed honestly, so the blank is refused with a BlankError that
names the kata and the name. gen_data.py writes the blank into the compiled kata; check_katas.py
checks it.
"""

from __future__ import annotations

import ast
import builtins
import copy

BLANK_COMMENT = "# Write it from memory. The tests import these names."
FUTURE_IMPORT = "from __future__ import annotations"

Definition = ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
BUILTINS = frozenset(dir(builtins))


class BlankError(ValueError):
    """The blank cannot be written honestly: a name it needs is neither defined nor imported."""


def imported_names(tests: str) -> list[str]:
    """The names test_kata.py imports from kata, in the order they are first imported."""
    names: list[str] = []
    for node in ast.parse(tests).body:
        if isinstance(node, ast.ImportFrom) and node.module == "kata" and node.level == 0:
            for alias in node.names:
                if alias.name not in names:
                    names.append(alias.name)
    return names


def _header(lines: list[str], node: Definition) -> str:
    """The definition's lines as written: decorators, then the header up to the body."""
    first = min([node.lineno, *(decorator.lineno for decorator in node.decorator_list)])
    body_line = node.body[0].lineno  # the header ends before the body's first statement
    if body_line <= node.lineno:  # a one-line definition has no header lines to keep
        shell = copy.copy(node)
        shell.body = []
        return ast.unparse(shell).rstrip()
    return "\n".join(lines[first - 1 : body_line - 1]).rstrip()


def _names(nodes: list[ast.expr]) -> set[str]:
    return {name.id for root in nodes for name in ast.walk(root) if isinstance(name, ast.Name)}


def _header_uses(node: Definition) -> tuple[set[str], set[str]]:
    """The names a header uses in annotations, and the names it uses elsewhere (defaults, bases)."""
    annotations: list[ast.expr] = []
    other: list[ast.expr] = list(node.decorator_list)
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        args = node.args
        for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs, args.vararg, args.kwarg]:
            if arg is not None and arg.annotation is not None:
                annotations.append(arg.annotation)
        other.extend(args.defaults)
        other.extend(default for default in args.kw_defaults if default is not None)
        if node.returns is not None:
            annotations.append(node.returns)
    else:
        other.extend(node.bases)
        other.extend(keyword.value for keyword in node.keywords)
    return _names(annotations), _names(other)


def memory_blank(solution: str, tests: str, kata: str = "kata") -> str:
    """The blank text: the comment line, the imports the stubs need, then one stub per name."""
    wanted = imported_names(tests)
    module = ast.parse(solution)
    chosen: list[Definition] = [
        node for node in module.body if isinstance(node, DEFINITIONS) and node.name in wanted
    ]
    defined = {node.name for node in chosen}
    missing = [name for name in wanted if name not in defined]
    if missing:
        raise BlankError(f"{kata}: the reference solution does not define: {', '.join(missing)}")
    lines = solution.splitlines()
    annotation_names: set[str] = set()
    other_names: set[str] = set()
    stubs: list[str] = []
    for node in chosen:
        in_annotations, elsewhere = _header_uses(node)
        annotation_names |= in_annotations
        other_names |= elsewhere
        stubs.append(f"{_header(lines, node)}\n    ...")
    imports: list[str] = []
    imported: set[str] = set()
    for item in module.body:
        if isinstance(item, (ast.Import, ast.ImportFrom)):
            bound = {(alias.asname or alias.name).split(".")[0] for alias in item.names}
            if bound & (annotation_names | other_names):
                imports.append(ast.unparse(item))
                imported |= bound
    provided = defined | imported | BUILTINS
    stray = sorted(other_names - provided)
    if stray:
        names = ", ".join(stray)
        raise BlankError(
            f"{kata}: the header uses {names} outside an annotation; the blank neither defines "
            "nor imports it"
        )
    head = [BLANK_COMMENT]
    if annotation_names - provided and FUTURE_IMPORT not in imports:
        head.append(FUTURE_IMPORT)
    head.extend(imports)
    return "\n".join(head) + "\n" + "\n\n".join(stubs) + "\n"
