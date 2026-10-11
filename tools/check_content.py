#!/usr/bin/env python3
"""Check course.json and the module pages against docs/AUTHORING.md (BP-0.5B).

Usage: python tools/check_content.py [PAGE_OR_DIR ...] [--course PATH] [--site DIR] [--content DIR]

With no page arguments it checks course.json (A1-A7) and every page in site/modules/ (B1-B8).
With page arguments it checks only those pages; course.json is then only loaded for reference.
Problems print as ``path:line: [rule] message``; the last line is the summary.
"""

from __future__ import annotations

import argparse
import bisect
import json
import re
import sys
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.lib.course import (  # noqa: E402
    REPO,
    Course,
    Module,
    Problem,
    ancestors,
    compute_counts,
    display_path,
    kind_spec,
    load_schema,
    load_yaml_file,
    modules_by_id,
    term_owners,
    yaml_item_lines,
)
from tools.render_curriculum import BEGIN, END, render  # noqa: E402

LAB_EXCLUDED = frozenset(
    {"hx-kata", "hx-cards", "hx-say", "hx-check", "hx-count", "hx-step", "hx-num"}
)
DRILL_TAGS = frozenset({"hx-say", "hx-design", "hx-kata", "hx-incident"})
PROSE_TAGS = frozenset({"p", "li", "h2", "h3", "figcaption", "td", "th", "dt", "dd", "blockquote"})
SKIP_TAGS = frozenset({"pre", "code", "script", "style", "svg"})
# Regions the generator fills (tools/gen_pages.py). Their text is generated, so the prose rules
# skip it; their markup must be one of GEN_TAGS (B9).
GENERATED_REGIONS = frozenset({"module-meta", "course-map", "topbar", "footer"})
GEN_TAGS = frozenset({
    "nav", "ol", "ul", "li", "a", "span", "p", "div", "svg", "use", "path", "circle",
    "line", "rect", "g", "title", "strong", "em", "section", "h3",
    # the top bar and the Menu sheet, and the footer (BP-5.3)
    "header", "dialog", "button", "label", "input", "footer",
})
HEADINGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
    "source", "track", "wbr",
})
EVERYDAY = frozenset({
    "task", "environment", "outcome", "session", "event", "request", "response", "turn", "exit",
    "brief", "queue", "policy", "reward", "allow", "ask", "deny", "guide", "sensor", "gate",
    "reviewer", "commit", "process", "header", "image", "mount", "diff", "signal", "fixture",
    "run", "trial", "seed", "role", "memory", "usage", "eval", "framework", "topology",
    "experiment", "baseline", "planner", "generator", "evaluator", "brain", "hands", "reset",
    "checkpoint", "canary", "transport", "skill", "hook", "container", "secret", "interrupt",
    "guard", "span", "enum", "probability", "weights", "training", "inference", "latency",
    "reliability", "entropy", "calibration", "variance", "sandbox", "permissions",
    "verification", "recovery", "observability", "wire",
})
# Counts of two or more only: digits 2+ or two..twelve, then a plural noun from the list.
# "one lab" and "one module" are not counts and are not flagged.
TYPED_COUNT = re.compile(
    r"\b((?:[2-9]|\d{2,})|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+"
    r"(modules|katas|parts|lessons|labs|objectives|failure families|terms|primers|cards)\b",
    re.IGNORECASE,
)
URL_ATTRS = ("href", "src")
WORD = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*")
PROSE_TARGET = 900
PROSE_LIMIT = 1000
CSS_HREF = "../assets/core/hx.css"
SCRIPT_SRC = "../assets/core/app.js"
TITLE_SUFFIX = " · HARNESSED"


# ---------------------------------------------------------------- report


@dataclass
class Report:
    """Problems fail the run; notes and warnings are printed and do not."""

    problems: list[Problem] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)

    def add(self, found: Problem) -> None:
        self.problems.append(found)
        self.lines.append(str(found))

    def problem(self, path: str, line: int, message: str) -> None:
        self.add(Problem(path, line, message))

    def note(self, text: str) -> None:
        self.lines.append(text)

    def warn(self, path: str, line: int, message: str) -> None:
        self.lines.append(f"{path}:{line}: warning: {message}")


@dataclass(frozen=True)
class RunResult:
    course_checked: bool
    pages_checked: int
    modules: int


# ---------------------------------------------------------------- HTML tree


@dataclass
class Text:
    text: str
    line: int


@dataclass
class Element:
    tag: str
    attrs: dict[str, str]
    line: int
    children: list[Element | Text] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())


@dataclass
class Page:
    root: Element
    doctype: str | None
    doctype_line: int
    doctype_first: bool


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Element("#document", {}, 1)
        self.stack: list[Element] = [self.root]
        self.doctype: str | None = None
        self.doctype_line = 0
        self.doctype_first = False
        self._saw_content = False

    def handle_decl(self, decl: str) -> None:
        if self.doctype is None:
            self.doctype = decl
            self.doctype_line = self.getpos()[0]
            self.doctype_first = not self._saw_content

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._saw_content = True
        element = Element(tag, {}, self.getpos()[0])
        for name, value in attrs:
            element.attrs.setdefault(name, value or "")
        self.stack[-1].children.append(element)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if data.strip():
            self._saw_content = True
        self.stack[-1].children.append(Text(data, self.getpos()[0]))

    def handle_comment(self, data: str) -> None:
        """A region opens at <!-- gen:NAME --> and closes at <!-- /gen:NAME --> or <!-- /gen -->."""
        text = data.strip()
        if text.startswith("gen:"):
            region = Element("#gen", {"name": text[len("gen:"):].strip()}, self.getpos()[0])
            self.stack[-1].children.append(region)
            self.stack.append(region)
        elif text == "/gen" or text.startswith("/gen:"):
            for index in range(len(self.stack) - 1, 0, -1):
                if self.stack[index].tag == "#gen":
                    del self.stack[index:]
                    return


def parse_page(text: str) -> Page:
    builder = _TreeBuilder()
    builder.feed(text)
    builder.close()
    return Page(builder.root, builder.doctype, builder.doctype_line, builder.doctype_first)


def descendants(node: Element) -> Iterator[Element]:
    for child in node.children:
        if isinstance(child, Element):
            yield child
            yield from descendants(child)


def all_text(node: Element) -> str:
    parts: list[str] = []
    for child in node.children:
        parts.append(child.text if isinstance(child, Text) else all_text(child))
    return "".join(parts)


def collapse(text: str) -> str:
    return " ".join(text.split())


def visible_text(
    node: Element,
    *,
    skip_fwd: bool,
    prose_only: bool = False,
    in_prose: bool = False,
    components: bool = False,
) -> Iterator[Text]:
    """Visible text under node.

    Skips pre/code/script/style/svg, optionally .fwd, and hx-* unless components.

    components=True includes the static fallback text inside hx-* elements (what a reader sees
    with no JavaScript).
    """
    for child in node.children:
        if isinstance(child, Text):
            if in_prose or not prose_only:
                yield child
            continue
        if child.tag == "#gen" or child.tag in SKIP_TAGS:
            continue
        if child.tag.startswith("hx-") and not components:
            continue
        if skip_fwd and "fwd" in child.classes:
            continue
        yield from visible_text(
            child,
            skip_fwd=skip_fwd,
            prose_only=prose_only,
            in_prose=in_prose or child.tag in PROSE_TAGS,
            components=components,
        )


def join_visible(texts: Iterable[Text]) -> tuple[str, list[int], list[int]]:
    """Join text pieces with one space each; returns the text, piece offsets and piece lines."""
    pieces: list[str] = []
    starts: list[int] = []
    lines: list[int] = []
    position = 0
    for piece in texts:
        if not piece.text:
            continue
        pieces.append(piece.text)
        starts.append(position)
        lines.append(piece.line)
        position += len(piece.text) + 1
    return " ".join(pieces), starts, lines


def line_at(offset: int, starts: list[int], lines: list[int]) -> int:
    index = bisect.bisect_right(starts, offset) - 1
    return lines[index] if index >= 0 else 0


def _find_line(text: str, needle: str) -> int:
    for number, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return number
    return 0


# ---------------------------------------------------------------- course checks (A)


def check_course(course_path: Path, report: Report, curriculum: Path | None) -> Course | None:
    """Run A1-A7 on course.json. Returns the course if it is valid enough for page checks."""
    shown = display_path(course_path)
    try:
        text = course_path.read_text(encoding="utf-8")
    except OSError as exc:
        report.problem(shown, 0, f"cannot read course.json: {exc.strerror}")
        return None
    try:
        course: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        report.problem(shown, exc.lineno, f"[A1] invalid JSON: {exc.msg}")
        return None
    if not isinstance(course, dict):
        report.problem(shown, 1, "[A1] the top level must be a JSON object")
        return None
    validator = jsonschema.Draft202012Validator(load_schema())
    errors = sorted(validator.iter_errors(course), key=lambda e: [str(p) for p in e.absolute_path])
    for error in errors:
        pointer = "/".join(str(part) for part in error.absolute_path) or "(root)"
        report.problem(shown, 0, f"[A1] schema: {pointer}: {error.message}")
    if errors:
        return None
    _check_references(course, text, shown, report)
    _check_graph(course, text, shown, report)
    _check_term_owners(course, text, shown, report)
    _check_counts(course, text, shown, report)
    if curriculum is not None:
        _check_curriculum(course, curriculum, report)
    return course


def _check_references(course: Course, text: str, shown: str, report: Report) -> None:
    def module_line(module_id: str) -> int:
        return _find_line(text, f'"id": "{module_id}"')

    wires = [w["id"] for w in course["wires"]]
    parts = [p["id"] for p in course["parts"]]
    families: list[dict[str, Any]] = course["failure_families"]
    family_ids = [f["id"] for f in families]
    modules: list[Module] = course["modules"]
    module_ids = [m["id"] for m in modules]
    slugs = [m["slug"] for m in modules]
    kinds: dict[str, Any] = course["kinds"]
    byid = modules_by_id(course)
    for label, values in (("wire", wires), ("part", parts), ("failure family", family_ids),
                          ("module", module_ids), ("module slug", slugs)):
        for dup in sorted({v for v in values if values.count(v) > 1}):
            report.problem(shown, _find_line(text, f'"{dup}"'), f"[A2] duplicate {label} '{dup}'")
    for module in modules:
        mid = module["id"]
        line = module_line(mid)
        for wire in module["wires"]:
            if wire not in wires:
                report.problem(shown, line, f"[A2] {mid}: unknown wire '{wire}'")
        if module["part"] not in parts:
            report.problem(shown, line, f"[A2] {mid}: unknown part '{module['part']}'")
        if module["kind"] not in kinds:
            report.problem(shown, line, f"[A2] {mid}: unknown kind '{module['kind']}'")
        for pre in module["prereqs"]:
            if pre not in byid:
                report.problem(shown, line, f"[A2] {mid}: unknown prerequisite '{pre}'")
        for primer in module["primers"]:
            if primer not in byid:
                report.problem(shown, line, f"[A2] {mid}: unknown primer '{primer}'")
        family = module["family"]
        if family is not None and family not in family_ids:
            report.problem(shown, line, f"[A2] {mid}: unknown failure family '{family}'")
        for index, objective in enumerate(module["objectives"], start=1):
            expected = f"{mid}.o{index}"
            if objective["id"] != expected:
                report.problem(shown, line, f"[A2] {mid}: objective {index} is "
                                            f"'{objective['id']}', expected '{expected}'")
        tag = module.get("tag")
        if module["kind"] == "core" and tag is None:
            report.problem(shown, line, f"[A2] {mid}: a core module needs a board tag "
                                        "(the module it plugs into the Harness Board)")
        if tag is not None and tag["wire"] not in module["wires"]:
            report.problem(shown, line, f"[A2] {mid}: board tag wire '{tag['wire']}' is not "
                                        "one of the module's wires")
        count = len(module["objectives"])
        if module["kind"] == "primer":
            if count != 3:
                report.problem(shown, line, f"[A2] {mid}: a primer has {count} objectives, "
                                            "needs 3")
        elif not 3 <= count <= 6:
            report.problem(shown, line, f"[A2] {mid}: {count} objectives, needs 3 to 6")
        kind = kinds.get(module["kind"])
        if kind is not None and "incident" in kind["requires"] and family is None:
            report.problem(shown, line, f"[A5] {mid}: kind {module['kind']} requires an incident, "
                                        "so it needs a failure family")
    for family in families:
        line = _find_line(text, f'"{family["id"]}"')
        if family["wire"] not in wires:
            report.problem(shown, line, f"[A2] failure family '{family['id']}': unknown wire "
                                        f"'{family['wire']}'")
        if family["module"] not in byid:
            report.problem(shown, line, f"[A5] failure family '{family['id']}': module "
                                        f"'{family['module']}' does not exist")


def _check_graph(course: Course, text: str, shown: str, report: Report) -> None:
    byid = modules_by_id(course)
    path: list[str] = course["path"]
    state: dict[str, int] = {}

    def visit(node: str, stack: list[str]) -> None:
        state[node] = 1
        stack.append(node)
        for pre in byid[node]["prereqs"]:
            if pre not in byid:
                continue
            if state.get(pre) == 1:
                cycle = stack[stack.index(pre):] + [pre]
                report.problem(shown, _find_line(text, f'"id": "{node}"'),
                               "[A3] prerequisite cycle: " + " -> ".join(cycle))
            elif pre not in state:
                visit(pre, stack)
        stack.pop()
        state[node] = 2

    for module_id in byid:
        if module_id not in state:
            visit(module_id, [])
    for entry in path:
        if entry not in byid:
            report.problem(shown, 0, f"[A3] path lists unknown module '{entry}'")
        elif byid[entry]["kind"] == "primer":
            report.problem(shown, _find_line(text, f'"id": "{entry}"'),
                           f"[A3] primer {entry} must not be in path")
    for entry in sorted(set(path)):
        number = path.count(entry)
        if number > 1:
            report.problem(shown, 0, f"[A3] module '{entry}' appears {number} times in path")
    for module in course["modules"]:
        if module["kind"] != "primer" and module["id"] not in path:
            report.problem(shown, _find_line(text, f'"id": "{module["id"]}"'),
                           f"[A3] {module['id']} is missing from path")
    position: dict[str, int] = {}
    for index, entry in enumerate(path):
        position.setdefault(entry, index)
    for index, entry in enumerate(path):
        if entry not in byid:
            continue
        line = _find_line(text, f'"id": "{entry}"')
        for pre in byid[entry]["prereqs"]:
            if pre not in position:
                report.problem(shown, line, f"[A3] prerequisite {pre} of {entry} is not in path")
            elif position[pre] > index:
                report.problem(shown, line,
                               f"[A3] {entry} comes before its prerequisite {pre} in path")


def _check_term_owners(course: Course, text: str, shown: str, report: Report) -> None:
    for term, owners in sorted(term_owners(course).items()):
        unique = list(dict.fromkeys(owners))
        line = _find_line(text, f'"{term}"')
        if len(unique) > 1:
            report.problem(shown, line, f"[A4] term '{term}' is listed by {', '.join(unique)} "
                                        "(each term needs exactly one owner)")
        elif len(owners) > len(unique):
            report.problem(shown, line, f"[A4] term '{term}' is listed more than once in "
                                        f"{unique[0]}")


def _check_counts(course: Course, text: str, shown: str, report: Report) -> None:
    line = _find_line(text, '"counts"')

    def diff(want: Any, got: Any, where: str) -> None:
        if isinstance(want, dict):
            if not isinstance(got, dict):
                report.problem(shown, line, f"[A6] counts.{where} must be an object")
                return
            for key in sorted(set(want) | set(got)):
                child = f"{where}.{key}" if where else key
                if key not in got:
                    report.problem(shown, line, f"[A6] counts.{child} is missing "
                                                f"(computed {want[key]})")
                elif key not in want:
                    report.problem(shown, line, f"[A6] counts.{child} is not computed")
                else:
                    diff(want[key], got[key], child)
        elif want != got:
            report.problem(shown, line, f"[A6] counts.{where}: file has {got}, computed {want}")

    diff(compute_counts(course), course["counts"], "")


def _check_curriculum(course: Course, curriculum: Path, report: Report) -> None:
    shown = display_path(curriculum)
    try:
        doc = curriculum.read_text(encoding="utf-8")
    except OSError as exc:
        report.problem(shown, 0, f"[A7] cannot read: {exc.strerror}")
        return
    if BEGIN not in doc or END not in doc:
        report.problem(shown, 0, "[A7] generated block markers are missing")
        return
    head, rest = doc.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    if f"{head}{BEGIN}\n{render(course)}\n{END}{tail}" != doc:
        report.problem(shown, _find_line(doc, BEGIN),
                       "[A7] generated block is stale: run python tools/render_curriculum.py")


# ---------------------------------------------------------------- content context


@dataclass(frozen=True)
class ObjectiveRef:
    """An objective a content file names.

    source is the file's stem (cards, say, checks) or "kata"; item is the id of the naming item.
    """

    objective: str
    shown: str
    line: int
    source: str = ""
    item: str = ""


@dataclass(frozen=True)
class TermInfo:
    id: str
    term: str
    aliases: tuple[str, ...]
    strict: bool
    owner: str
    from_yaml: bool


@dataclass
class Context:
    course: Course
    modules: dict[str, Module]
    slugs: dict[str, str]
    objective_ids: set[str]
    refs: dict[str, list[ObjectiveRef]]
    entries: dict[str, list[TermInfo]]
    terms: dict[str, TermInfo]


def kebab(term: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")


def _load_list(path: Path, shown: str, report: Report) -> list[tuple[int, Any]]:
    """Items of a YAML list with their start lines. Reports syntax errors and non-lists."""
    data, problems = load_yaml_file(path, shown)
    for found in problems:
        report.add(found)
    if data is None:
        return []
    if not isinstance(data, list):
        report.problem(shown, 0, "content files must be a YAML list")
        return []
    lines = yaml_item_lines(path)
    return [(lines[i] if i < len(lines) else 0, item) for i, item in enumerate(data)]


def _load_meta(path: Path, shown: str, report: Report) -> Any:
    data, problems = load_yaml_file(path, shown)
    for found in problems:
        report.add(found)
    return data


def build_context(course: Course, content_dir: Path, katas_dir: Path, report: Report) -> Context:
    modules = modules_by_id(course)
    objective_ids = {o["id"] for m in course["modules"] for o in m["objectives"]}
    refs: dict[str, list[ObjectiveRef]] = {mid: [] for mid in modules}
    entries: dict[str, list[tuple[int, str, dict[str, Any]]]] = {mid: [] for mid in modules}

    if content_dir.is_dir():
        for folder in sorted(p for p in content_dir.iterdir() if p.is_dir()):
            owner = folder.name
            if owner not in modules:
                report.problem(display_path(folder), 0,
                               f"content folder '{owner}' is not a module in course.json")
                continue
            for yaml_path in sorted(folder.glob("*.yaml")):
                if yaml_path.name == "placement.yaml":
                    continue  # a mapping (questions, rules, start), checked by tools/gen_data.py
                shown = display_path(yaml_path)
                for line, item in _load_list(yaml_path, shown, report):
                    if not isinstance(item, dict):
                        continue
                    if yaml_path.name == "terms.yaml":
                        entries[owner].append((line, shown, item))
                    names: list[str] = []
                    if isinstance(item.get("objective"), str):
                        names.append(item["objective"])
                    if isinstance(item.get("objectives"), list):
                        names.extend(str(x) for x in item["objectives"])
                    refs[owner].extend(
                        ObjectiveRef(n, shown, line, yaml_path.stem, str(item.get("id", "")))
                        for n in names
                    )
    if katas_dir.is_dir():
        for meta_path in sorted(katas_dir.glob("*/meta.yaml")):
            shown = display_path(meta_path)
            meta = _load_meta(meta_path, shown, report)
            if not isinstance(meta, dict):
                continue
            owner = str(meta.get("module", ""))
            objectives = meta.get("objectives", [])
            if owner in refs and isinstance(objectives, list):
                refs[owner].extend(
                    ObjectiveRef(str(x), shown, 0, "kata", meta_path.parent.name)
                    for x in objectives
                )

    for owner, module_refs in refs.items():
        for ref in module_refs:
            if ref.objective not in objective_ids:
                report.problem(ref.shown, ref.line,
                               f"[B4] unknown objective id '{ref.objective}' (in {owner} content)")

    term_entries: dict[str, list[TermInfo]] = {}
    terms = _build_terms(course, entries, term_entries, report)
    slugs = {m["slug"]: m["id"] for m in course["modules"]}
    return Context(course, modules, slugs, objective_ids, refs, term_entries, terms)


def _build_terms(
    course: Course,
    raw: dict[str, list[tuple[int, str, dict[str, Any]]]],
    by_owner: dict[str, list[TermInfo]],
    report: Report,
) -> dict[str, TermInfo]:
    planned: dict[str, set[str]] = {}
    for module in course["modules"]:
        for term in module["terms"]:
            planned.setdefault(term.lower(), set()).add(module["id"])
    terms: dict[str, TermInfo] = {}
    matched: set[tuple[str, str]] = set()
    for owner, items in raw.items():
        for line, shown, item in items:
            term = item.get("term")
            term_id = item.get("id")
            if not isinstance(term, str) or not isinstance(term_id, str):
                report.problem(shown, line, "[B7] terms.yaml entries need string 'id' and 'term'")
                continue
            if owner not in planned.get(term.lower(), set()):
                report.problem(shown, line, f"[B7] (a) term '{term}' is not planned for {owner} "
                                            "in course.json")
                continue
            if term_id in terms:
                report.problem(shown, line, f"[B7] term id '{term_id}' is used twice")
                continue
            aliases_raw = item.get("aliases") or []
            aliases = [str(a) for a in aliases_raw] if isinstance(aliases_raw, list) else []
            strict = item.get("strict", term.lower() not in EVERYDAY)
            info = TermInfo(term_id, term, tuple(aliases) or (term,), bool(strict), owner, True)
            terms[term_id] = info
            by_owner.setdefault(owner, []).append(info)
            matched.add((owner, term.lower()))
    for module in course["modules"]:
        owner = module["id"]
        for term in module["terms"]:
            if (owner, term.lower()) in matched:
                continue
            term_id = kebab(term)
            if term_id in terms:
                if terms[term_id].owner != owner:
                    report.problem("course.json", 0,
                                   f"[B7] term id '{term_id}' is used by {terms[term_id].owner} "
                                   f"and {owner}")
                continue
            info = TermInfo(term_id, term, (term,), term.lower() not in EVERYDAY, owner, False)
            terms[term_id] = info
            by_owner.setdefault(owner, []).append(info)
    return terms


# ---------------------------------------------------------------- page checks (B)


def check_page(path: Path, ctx: Context, report: Report) -> bool:
    """Run B1-B8 on one module page. Returns True when the page added no problems."""
    shown = display_path(path)
    before = len(report.problems)
    module_id = ctx.slugs.get(path.stem)
    if module_id is None:
        report.problem(shown, 0, f"[B1] file name '{path.stem}' is not a module slug")
        return False
    module = ctx.modules[module_id]
    page = parse_page(path.read_text(encoding="utf-8"))
    main = _main_or_root(page)
    _check_skeleton(page, module, shown, report)
    _check_beats(page, module, ctx, shown, report)
    _check_requirements(page, module, ctx, shown, report)
    _check_objectives(page, module, ctx, shown, report)
    _check_prose(page, shown, report)
    _check_typed_counts(main, shown, report)
    _check_terms(page, module, ctx, shown, report)
    _check_hygiene(page, shown, report)
    _check_generated(page, shown, report)
    return len(report.problems) == before


def _check_generated(page: Page, shown: str, report: Report) -> None:
    """[B9] The generated regions exist, and their markup is one the generator writes."""
    regions = [e for e in descendants(page.root) if e.tag == "#gen"]
    names = {e.attrs.get("name", "") for e in regions}
    for name in sorted(GENERATED_REGIONS - names):
        report.problem(shown, 0, f"[B9] the page needs a generated region gen:{name}")
    for region in regions:
        name = region.attrs.get("name", "")
        for element in descendants(region):
            if element.tag not in GEN_TAGS:
                report.problem(shown, element.line,
                               f"[B9] <{element.tag}> is not allowed in gen:{name}")


def _main_or_root(page: Page) -> Element:
    for element in descendants(page.root):
        if element.tag == "main":
            return element
    return page.root


def _check_skeleton(page: Page, module: Module, shown: str, report: Report) -> None:
    mid = module["id"]
    if page.doctype is None or page.doctype.lower() != "doctype html" or not page.doctype_first:
        report.problem(shown, page.doctype_line or 1,
                       "[B1] the page must start with <!doctype html>")
    elements = list(descendants(page.root))
    html_elements = [e for e in elements if e.tag == "html"]
    if not html_elements:
        report.problem(shown, 0, "[B1] missing <html> element")
    else:
        html_el = html_elements[0]
        if html_el.attrs.get("lang") != "en":
            report.problem(shown, html_el.line, '[B1] <html lang="en"> is required')
        if html_el.attrs.get("data-module") != mid:
            report.problem(shown, html_el.line, f'[B1] <html data-module="{mid}"> is required')
    titles = [e for e in elements if e.tag == "title"]
    expected_title = module["title"] + TITLE_SUFFIX
    if not titles or collapse(all_text(titles[0])) != expected_title:
        report.problem(shown, titles[0].line if titles else 0,
                       f'[B1] <title> must be "{expected_title}"')
    h1s = [e for e in elements if e.tag == "h1"]
    if len(h1s) != 1:
        report.problem(shown, h1s[1].line if len(h1s) > 1 else 0,
                       f"[B1] exactly one <h1> is required (found {len(h1s)})")
    elif collapse(all_text(h1s[0])) != module["title"]:
        report.problem(shown, h1s[0].line, f'[B1] the <h1> must be "{module["title"]}"')
    if not any(e.tag == "link" and e.attrs.get("href") == CSS_HREF for e in elements):
        report.problem(shown, 0, f'[B1] missing <link href="{CSS_HREF}">')
    if not any(e.tag == "script" and e.attrs.get("type") == "module"
               and e.attrs.get("src") == SCRIPT_SRC for e in elements):
        report.problem(shown, 0, f'[B1] missing <script type="module" src="{SCRIPT_SRC}">')
    if not any(e.tag == "a" and e.attrs.get("href") == "#main" for e in elements):
        report.problem(shown, 0, '[B1] missing skip link to "#main"')
    mains = [e for e in elements if e.tag == "main"]
    if not mains or mains[0].attrs.get("id") != "main":
        report.problem(shown, mains[0].line if mains else 0, '[B1] <main id="main"> is required')


def _beat_sections(page: Page) -> list[Element]:
    return [
        e for e in descendants(page.root)
        if e.tag == "section" and "beat" in e.classes and "data-beat" in e.attrs
    ]


def _check_beats(page: Page, module: Module, ctx: Context, shown: str, report: Report) -> None:
    beats: list[str] = list(kind_spec(ctx.course, module["kind"])["beats"])
    sections = _beat_sections(page)
    names = [s.attrs["data-beat"] for s in sections]
    if names != beats:
        report.problem(shown, sections[0].line if sections else 0,
                       f"[B2] beats are {names} but kind {module['kind']} requires {beats}")
    for name in sorted({n for n in names if names.count(n) > 1}):
        report.problem(shown, 0, f"[B2] beat '{name}' appears more than once")
    for section in sections:
        name = section.attrs["data-beat"]
        if section.attrs.get("id") != name:
            report.problem(shown, section.line, f'[B2] beat "{name}" must have id="{name}"')
        first = next((e for e in descendants(section) if e.tag in HEADINGS), None)
        if first is None or first.tag != "h2":
            report.problem(shown, section.line,
                           f'[B2] beat "{name}": the first heading must be <h2>')
    previous = 0
    for element in descendants(page.root):
        if element.tag in HEADINGS:
            level = int(element.tag[1])
            if level > previous + 1:
                report.problem(shown, element.line,
                               f"[B2] heading jumps from h{previous} to h{level}")
            previous = level


_REQUIREMENTS: dict[str, tuple[tuple[str, ...] | None, str]] = {
    "incident": (("break",), "an hx-incident, or an hx-replay with predict"),
    "lab": (("fix", "lab"), "a lab component (an hx-* other than kata, cards, say, check, count,"
                            " step)"),
    "kata": (("fix",), "an hx-kata"),
    "prove": (("prove",), "an hx-bench"),
    "check": (("check",), "an hx-check"),
    "step": (("fix",), "an hx-step"),
    "cards": (("keep",), "an hx-cards"),
    "say": (("keep",), "an hx-say"),
    "drill": (None, "one of hx-say, hx-design, hx-kata or hx-incident"),
}


def _requirement_met(name: str, elements: list[Element]) -> bool:
    if name == "incident":
        return any(e.tag == "hx-incident" or (e.tag == "hx-replay" and "predict" in e.attrs)
                   for e in elements)
    if name == "lab":
        return any(e.tag.startswith("hx-") and e.tag not in LAB_EXCLUDED for e in elements)
    if name == "drill":
        return any(e.tag in DRILL_TAGS for e in elements)
    tags = {"kata": "hx-kata", "prove": "hx-bench", "check": "hx-check", "step": "hx-step",
            "cards": "hx-cards", "say": "hx-say"}
    return any(e.tag == tags[name] for e in elements)


def _check_requirements(
    page: Page, module: Module, ctx: Context, shown: str, report: Report
) -> None:
    mid = module["id"]
    kind = module["kind"]
    for name in kind_spec(ctx.course, kind)["requires"]:
        if name not in _REQUIREMENTS:
            report.problem(shown, 0, f"[B3] unknown requirement '{name}' in course.json")
            continue
        beats, description = _REQUIREMENTS[name]
        if beats is None:
            scope = list(descendants(page.root))
            where = ""
        else:
            scope = [d for s in _beat_sections(page) if s.attrs["data-beat"] in beats
                     for d in descendants(s)]
            where = f" in {'/'.join(beats)}"
        if not _requirement_met(name, scope):
            report.problem(shown, 0, f"[B3] {mid} ({kind}) needs {description}{where}")
    keep = [s for s in _beat_sections(page) if s.attrs["data-beat"] == "keep"]
    laws = [collapse(all_text(p)) for s in keep for p in descendants(s)
            if p.tag == "p" and "law" in p.classes]
    if module["law"] not in laws:
        report.problem(shown, keep[0].line if keep else 0,
                       f'[B3] the keep beat needs <p class="law">{module["law"]}</p>')


PREDICT_OBJECTIVE = ('[B4] a prediction proves no objective: remove data-objective from '
                     'mode="predict" (AUTHORING §13.7)')


# D-061: the components whose success credits the objectives on their element. hx-say and hx-cards
# credit the objectives their content names (below), hx-check credits its check item, and hx-replay
# credits nothing.
CREDITING_ELEMENTS = frozenset({"hx-incident", "hx-kata", "hx-step", "hx-bench"})


def _ref_is_credited(ref: ObjectiveRef, module_id: str, page_items: _PageCredits) -> bool:
    """Whether the page renders the component that credits this content objective (D-061)."""
    if ref.source == "cards":
        return module_id in page_items.cards
    if ref.source == "say":
        return module_id in page_items.says
    if ref.source == "checks":
        return ref.item in page_items.checks
    if ref.source == "kata":
        return ref.item in page_items.katas
    return False


@dataclass
class _PageCredits:
    """What the page renders that can credit an objective: check items, katas, say and cards."""

    checks: set[str] = field(default_factory=set)
    katas: set[str] = field(default_factory=set)
    says: set[str] = field(default_factory=set)
    cards: set[str] = field(default_factory=set)


def _check_objectives(page: Page, module: Module, ctx: Context, shown: str, report: Report) -> None:
    covered: set[str] = set()
    page_items = _PageCredits()
    # The generated header lists every objective (gen:module-meta); a list item there is not an
    # assessment item, so it never counts as coverage.
    listed = {id(d) for e in descendants(page.root) if "data-objective-list" in e.attrs
              for d in descendants(e)}
    for element in descendants(page.root):
        if id(element) in listed:
            continue
        if element.tag == "hx-check" and element.attrs.get("mode") == "predict":
            # A prediction is recorded, never credited (COMPONENTS §5): it proves no objective.
            if element.attrs.get("data-objective", "").strip():
                report.problem(shown, element.line, PREDICT_OBJECTIVE)
            continue
        if element.tag == "hx-check":
            page_items.checks.add(element.attrs.get("item", ""))
        elif element.tag == "hx-kata":
            page_items.katas.add(element.attrs.get("kata", ""))
        elif element.tag == "hx-say":
            page_items.says.add(element.attrs.get("src", ""))
        elif element.tag == "hx-cards":
            page_items.cards.add(element.attrs.get("src", ""))
        credits = element.tag == "hx-check" or element.tag in CREDITING_ELEMENTS
        for token in element.attrs.get("data-objective", "").split():
            if credits:
                covered.add(token)
            if token not in ctx.objective_ids:
                report.problem(shown, element.line, f"[B4] unknown objective id '{token}'")
    for ref in ctx.refs.get(module["id"], []):
        if _ref_is_credited(ref, module["id"], page_items):
            covered.add(ref.objective)
    for objective in module["objectives"]:
        if objective["id"] not in covered:
            report.problem(shown, 0, f"[B4] objective {objective['id']} has no assessment item "
                                     "(a crediting component's data-objective, or a content item "
                                     "it renders)")


def _check_prose(page: Page, shown: str, report: Report) -> None:
    total = 0
    for section in _beat_sections(page):
        for piece in visible_text(section, skip_fwd=False, prose_only=True):
            total += len(WORD.findall(piece.text))
    report.note(f"{shown}: prose {total} words")
    if total > PROSE_LIMIT:
        report.problem(shown, 0, f"[B5] prose is {total} words; the limit is {PROSE_LIMIT:,} "
                                 "(split the module)")
    elif total > PROSE_TARGET:
        report.warn(shown, 0, f"[B5] prose is {total} words; the target is {PROSE_TARGET}")


def _check_typed_counts(main: Element, shown: str, report: Report) -> None:
    text, starts, lines = join_visible(visible_text(main, skip_fwd=False))
    for found in TYPED_COUNT.finditer(text):
        report.problem(shown, line_at(found.start(), starts, lines),
                       f"[B6] typed count '{found.group(0)}': take the count from course.json "
                       "with <hx-count>")


def _alias_pattern(alias: str) -> re.Pattern[str]:
    body = r"\s+".join(re.escape(part) for part in alias.split())
    return re.compile(rf"(?<!\w){body}s?(?!\w)", re.IGNORECASE)


def _check_terms(page: Page, module: Module, ctx: Context, shown: str, report: Report) -> None:
    mid = module["id"]
    elements = list(descendants(page.root))
    for element in elements:
        if "data-term" in element.attrs and element.attrs["data-term"] not in ctx.terms:
            report.problem(shown, element.line,
                           f"[B7] data-term '{element.attrs['data-term']}' is not a known term id")
    dfn_seen: dict[str, int] = {}
    for element in elements:
        if element.tag != "dfn" or "data-term" not in element.attrs:
            continue
        term_id = element.attrs["data-term"]
        dfn_seen[term_id] = dfn_seen.get(term_id, 0) + 1
        info = ctx.terms.get(term_id)
        if info is not None and info.owner != mid:
            report.problem(shown, element.line,
                           f"[B7] <dfn> for '{info.term}' belongs in {info.owner}, not {mid}")
        if dfn_seen[term_id] == 2:
            report.problem(shown, element.line,
                           f"[B7] '{term_id}' has more than one <dfn> on this page")
    for info in ctx.entries.get(mid, []):
        if info.from_yaml and dfn_seen.get(info.id, 0) == 0:
            report.problem(shown, 0, f"[B7] no <dfn data-term=\"{info.id}\"> for "
                                     f"'{info.term}', which {mid} owns")
    fwd = [e for e in elements if e.tag == "span" and "fwd" in e.classes]
    if len(fwd) > 2:
        report.problem(shown, fwd[2].line,
                       f"[B7] {len(fwd)} .fwd spans on this page; at most two are allowed")
    # The static text inside components counts too: a term there is taught to a reader with no
    # JavaScript (B7).
    text, starts, lines = join_visible(
        visible_text(_main_or_root(page), skip_fwd=True, components=True)
    )
    allowed = ancestors(ctx.course, mid) | {mid}
    local = {t.lower() for t in module.get("local_terms", [])}
    for info in ctx.terms.values():
        if not info.strict or info.owner in allowed or info.term.lower() in local:
            continue
        for alias in info.aliases:
            found = _alias_pattern(alias).search(text)
            if found is not None:
                report.problem(shown, line_at(found.start(), starts, lines),
                               f"[B7] term '{info.term}' is taught in {info.owner}, which is "
                               f"not {mid} or one of its prerequisites")
                break


def _check_hygiene(page: Page, shown: str, report: Report) -> None:
    for element in descendants(page.root):
        if "style" in element.attrs:
            report.problem(shown, element.line, "[B8] inline style attributes are not allowed")
        for name in element.attrs:
            if name.startswith("on"):
                report.problem(shown, element.line,
                               f"[B8] inline event-handler attribute '{name}' is not allowed")
        for name in URL_ATTRS:
            # Browsers ignore whitespace and control characters inside a URL scheme.
            url = re.sub(r"[\s\x00-\x1f]+", "", element.attrs.get(name, "")).lower()
            if url.startswith("javascript:"):
                report.problem(shown, element.line,
                               f"[B8] javascript: URLs are not allowed in {name}")
        if element.tag == "script":
            module_script = (element.attrs.get("type") == "module"
                             and element.attrs.get("src") == SCRIPT_SRC
                             and not all_text(element).strip())
            if not module_script:
                report.problem(shown, element.line,
                               f"[B8] the only script allowed is the module script {SCRIPT_SRC}")
        src = element.attrs.get("src", "").lower()
        if src.startswith(("http:", "https:")):
            report.problem(shown, element.line, f"[B8] src points outside the site: {src}")
        # A code block can scroll sideways, so keys must reach it; an output wraps instead (hx.css).
        if element.tag == "pre" and "data-output" not in element.attrs:
            attrs = element.attrs
            focusable = (attrs.get("tabindex") == "0" and attrs.get("role") == "region"
                         and attrs.get("aria-label", "").strip())
            if not focusable:
                report.problem(shown, element.line,
                               '[B8] a <pre> needs tabindex="0", role="region" and an aria-label '
                               "(or data-output, for an output)")


# ---------------------------------------------------------------- driver


def page_paths(args: Sequence[str], site: Path) -> list[Path]:
    if not args:
        modules_dir = site / "modules"
        return sorted(modules_dir.glob("*.html")) if modules_dir.is_dir() else []
    found: list[Path] = []
    for raw in args:
        target = Path(raw)
        if target.is_dir():
            found.extend(sorted(target.glob("*.html")))
        else:
            found.append(target)
    return found


def run_checks(
    *,
    course_path: Path,
    site: Path,
    content: Path,
    pages: Sequence[str] = (),
    curriculum: Path | None,
    report: Report,
) -> RunResult:
    """Run the checks, appending to report. Pass curriculum=None to skip the A7 doc check."""
    full_run = not pages
    course: Course | None
    if full_run:
        course = check_course(course_path, report, curriculum)
    else:
        try:
            course = json.loads(course_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            report.problem(display_path(course_path), 0, f"cannot load course.json: {exc}")
            course = None
    modules = len(course["modules"]) if course is not None else 0
    if course is None:
        return RunResult(course_checked=False, pages_checked=0, modules=0)
    ctx = build_context(course, content, content.parent / "katas", report)
    checked = 0
    for path in page_paths(pages, site):
        check_page(path, ctx, report)
        checked += 1
    return RunResult(course_checked=full_run, pages_checked=checked, modules=modules)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check course.json and module pages.")
    parser.add_argument("pages", nargs="*", help="page files or directories of pages")
    parser.add_argument("--course", type=Path, default=REPO / "course.json")
    parser.add_argument("--site", type=Path, default=REPO / "site")
    parser.add_argument("--content", type=Path, default=REPO / "content")
    args = parser.parse_args(argv)
    report = Report()
    curriculum = args.course.parent / "docs" / "CURRICULUM.md" if not args.pages else None
    result = run_checks(course_path=args.course, site=args.site, content=args.content,
                        pages=args.pages, curriculum=curriculum, report=report)
    for line in report.lines:
        print(line)
    if report.problems:
        print(f"check_content: FAILED ({len(report.problems)} problems)")
        return 1
    if result.course_checked:
        print(f"check_content: course.json OK ({result.modules} modules), "
              f"{result.pages_checked} pages OK")
    else:
        print(f"check_content: course.json not checked, {result.pages_checked} pages OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
