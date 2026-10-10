"""Read-only helpers over course.json (the single source of truth, docs/CURRICULUM.md §1).

Shared by tools/check_content.py and tools/gen_data.py. Nothing here writes files.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPO: Path = Path(__file__).resolve().parents[2]
"""The repository root: the directory that holds course.json."""

SCHEMA_PATH: Path = REPO / "tools" / "schemas" / "course.schema.json"

Course = dict[str, Any]
Module = dict[str, Any]


@dataclass(frozen=True)
class Problem:
    """One problem, printed as ``path:line: message``. Line 0 means unknown."""

    path: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


def display_path(path: Path) -> str:
    """Repo-relative path when the file is inside the repository, else the path as given."""
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return path.as_posix()


def load_course(path: Path | str | None = None) -> Course:
    """Load course.json (default: the repository's). Raises ValueError if it is not an object."""
    source = Path(path) if path is not None else REPO / "course.json"
    data: Any = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{source}: top level must be a JSON object")
    return data


def modules_by_id(course: Course) -> dict[str, Module]:
    """Map module id to its record."""
    modules: list[Module] = course["modules"]
    return {m["id"]: m for m in modules}


def ancestors(course: Course, module_id: str) -> set[str]:
    """Transitive prerequisites of ``module_id``, following ``prereqs`` only (never primers).

    The module itself is not included. Raises KeyError for an unknown module id.
    """
    byid = modules_by_id(course)
    if module_id not in byid:
        raise KeyError(f"unknown module {module_id!r}")
    seen: set[str] = set()
    stack: list[str] = list(byid[module_id]["prereqs"])
    while stack:
        current = stack.pop()
        if current == module_id or current in seen:
            continue
        seen.add(current)
        if current in byid:
            stack.extend(byid[current]["prereqs"])
    return seen


def kind_spec(course: Course, kind: str) -> dict[str, Any]:
    """Beats and requirements of a module kind. Raises KeyError for an unknown kind."""
    kinds: dict[str, Any] = course["kinds"]
    if kind not in kinds:
        raise KeyError(f"unknown kind {kind!r}")
    spec: dict[str, Any] = kinds[kind]
    return spec


def compute_counts(course: Course) -> dict[str, Any]:
    """Recompute the ``counts`` block of course.json from its contents."""
    modules: list[Module] = course["modules"]
    byid = modules_by_id(course)
    by_kind: dict[str, int] = {kind: 0 for kind in course["kinds"]}
    for module in modules:
        by_kind[module["kind"]] = by_kind.get(module["kind"], 0) + 1
    path: list[str] = course["path"]
    terms = {term.lower() for module in modules for term in module["terms"]}
    return {
        "modules": len(modules),
        "modules_by_kind": by_kind,
        "parts": len(course["parts"]),
        "wires": len(course["wires"]),
        "objectives": sum(len(module["objectives"]) for module in modules),
        "terms_planned": len(terms),
        "failure_families": len(course["failure_families"]),
        "minutes_path": sum(byid[p]["minutes"] for p in path if p in byid),
        "minutes_all": sum(module["minutes"] for module in modules),
    }


def term_owners(course: Course) -> dict[str, list[str]]:
    """Lower-cased term to the module ids that list it, in module order (duplicates kept)."""
    owners: dict[str, list[str]] = {}
    for module in course["modules"]:
        for term in module["terms"]:
            owners.setdefault(term.lower(), []).append(module["id"])
    return owners


def term_owner(course: Course) -> dict[str, str]:
    """Lower-cased term to its owner module id (the first, if a term is listed twice)."""
    return {term: ids[0] for term, ids in term_owners(course).items()}


def load_yaml_file(path: Path, shown: str) -> tuple[Any, list[Problem]]:
    """Parse a YAML file. Returns (data, problems); data is None when problems are reported."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return None, [Problem(shown, 0, f"cannot read file: {exc.strerror}")]
    try:
        data: Any = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        line = int(mark.line) + 1 if mark is not None else 0
        reason = getattr(exc, "problem", None) or "invalid YAML"
        return None, [Problem(shown, line, f"invalid YAML: {reason}")]
    return data, []


def yaml_item_lines(path: Path) -> list[int]:
    """1-based start line of each item of a top-level YAML sequence (empty if not a sequence)."""
    node = yaml.compose(path.read_text(encoding="utf-8"), Loader=yaml.SafeLoader)
    if not isinstance(node, yaml.SequenceNode):
        return []
    return [int(item.start_mark.line) + 1 for item in node.value]


def load_schema() -> dict[str, Any]:
    """The JSON Schema for course.json (tools/schemas/course.schema.json)."""
    data: Any = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{SCHEMA_PATH}: schema must be a JSON object")
    return data
