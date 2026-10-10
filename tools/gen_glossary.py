#!/usr/bin/env python3
"""Generate the glossary list in site/glossary.html from the course's terms (BP-5.2).

Usage: python tools/gen_glossary.py [--check] [--root DIR]

The list sits between `<!-- gen:glossary -->` and `<!-- /gen:glossary -->` marker lines. Everything
outside the markers is hand-written and left alone. Inputs under DIR: site/data/terms.json (keyed by
term id), site/data/course.json (wires, modules and their slugs), site/data/course-core.json (the
`built` flag of each module: a module is built when it has a page), and site/assets/core/glyphs.svg
(every wire glyph must be in the sprite).

Each term is grouped under its first letter (a non-letter goes under #), with a letter index at the
top. A term names its wire (glyph and short name, coloured by the wire's own token) and where it is
taught: a link to the module page when the module is built, else the title and "coming".

Writes the page unless --check is given. With --check nothing is written: a stale page is named on
stderr and the exit status is 1. Exit status 2 means an input is missing or inconsistent, or a
marker
is missing or repeated. The last line is the summary: "gen_glossary: <n> terms, page up to date",
"... page written", or "... page stale".
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

REPO = Path(__file__).resolve().parent.parent
PAGE = "glossary.html"
REGION = "glossary"

Json = dict[str, Any]


class GenError(Exception):
    """An input or marker problem: the generator stops and writes nothing."""


@dataclass(frozen=True)
class Context:
    terms: dict[str, Json]
    wires: dict[str, Json]
    modules: dict[str, Json]
    built: dict[str, bool]
    sprite: frozenset[str]


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def read_json(path: Path) -> Any:
    if not path.is_file():
        raise GenError(f"missing input {path}")
    value: Any = json.loads(path.read_text(encoding="utf-8"))
    return value


def read_sprite(path: Path) -> frozenset[str]:
    if not path.is_file():
        raise GenError(f"missing input {path}")
    root = ET.parse(path).getroot()
    ids: set[str] = set()
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        ident = element.get("id") or ""
        if tag == "symbol" and ident.startswith("g-"):
            ids.add(ident[2:])
    return frozenset(ids)


def load(root: Path) -> Context:
    site = root / "site"
    terms_raw = read_json(site / "data" / "terms.json")
    course = read_json(site / "data" / "course.json")
    core = read_json(site / "data" / "course-core.json")
    sprite = read_sprite(site / "assets" / "core" / "glyphs.svg")
    if not isinstance(terms_raw, dict):
        raise GenError("terms.json must be an object keyed by term id")
    wires = {str(w["id"]): w for w in course["wires"]}
    modules = {str(m["id"]): m for m in course["modules"]}
    built = {str(m["id"]): bool(m.get("built")) for m in core["modules"]}
    for wire in wires.values():
        if str(wire["glyph"]) not in sprite:
            raise GenError(f"wire {wire['id']}: glyph {wire['glyph']!r} is not in glyphs.svg")
    terms: dict[str, Json] = {}
    for key, term in terms_raw.items():
        where = f"terms.json {key}"
        if term.get("id") != key:
            raise GenError(f"{where}: its id field does not match its key")
        wire_id = term.get("wire")
        if wire_id is not None and str(wire_id) not in wires:
            raise GenError(f"{where}: unknown wire {wire_id!r}")
        if str(term.get("module")) not in modules:
            raise GenError(f"{where}: unknown module {term.get('module')!r}")
        if not isinstance(term.get("term"), str) or not isinstance(term.get("definition"), str):
            raise GenError(f"{where}: needs a term and a definition")
        terms[key] = term
    return Context(terms=terms, wires=wires, modules=modules, built=built, sprite=sprite)


def letter_of(term: Json) -> str:
    first = str(term["term"])[:1].upper()
    return first if first.isascii() and first.isalpha() else "#"


def sort_key(term: Json) -> tuple[str, str]:
    return (str(term["term"]).casefold(), str(term["id"]))


def wire_tag(term: Json, ctx: Context) -> str:
    """The wire's glyph and short name, in its own token. A term with no wire says so in words."""
    if term.get("wire") is None:
        return '<span class="wire">Not on a wire</span>'
    wire = ctx.wires[str(term["wire"])]
    return (
        f'<span class="wire w-{esc(str(wire["id"]))}"><svg class="glyph" viewBox="0 0 24 24" '
        f'aria-hidden="true" focusable="false"><use href="assets/core/glyphs.svg#g-'
        f'{esc(str(wire["glyph"]))}"></use></svg> '
        f"{esc(str(wire['short']))}</span>"
    )


def entry_lines(term: Json, ctx: Context) -> list[str]:
    wire_id = "" if term.get("wire") is None else str(term["wire"])
    wire_name = "" if not wire_id else str(ctx.wires[wire_id]["short"])
    module = ctx.modules[str(term["module"])]
    module_id = str(module["id"])
    label = f"{module_id} · {module['title']}"
    if ctx.built.get(module_id):
        taught = f'<a href="modules/{esc(str(module["slug"]))}.html">{esc(label)}</a>'
    else:
        taught = f"{esc(label)} · coming"
    name = str(term["term"])
    aliases = [str(a) for a in term.get("aliases", []) if str(a) != name]
    lines = [
        f'<div class="term-entry" data-filter-item data-wire="{esc(wire_id)}" '
        f'data-wire-name="{esc(wire_name)}" id="entry-{esc(str(term["id"]))}">',
        f'  <h3 class="term-name"><dfn id="term-{esc(str(term["id"]))}">{esc(name)}</dfn></h3>',
        f'  <p class="term-def">{esc(str(term["definition"]))}</p>',
        '  <p class="term-meta">',
        f"    {wire_tag(term, ctx)}",
        f'    <span class="taught">Taught in {taught}</span>',
        "  </p>",
    ]
    if aliases:
        lines.append(f'  <p class="term-alias">Also written: {esc(", ".join(aliases))}</p>')
    lines.append("</div>")
    return lines


def render_region(ctx: Context) -> list[str]:
    ordered = sorted(ctx.terms.values(), key=sort_key)
    groups: dict[str, list[Json]] = {}
    for term in ordered:
        groups.setdefault(letter_of(term), []).append(term)
    letters = sorted(groups, key=lambda letter: (letter == "#", letter))
    lines = ['<nav class="glossary-index" aria-label="Letters">', "  <ul>"]
    for letter in letters:
        anchor = "letter-other" if letter == "#" else f"letter-{letter.lower()}"
        shown = "other" if letter == "#" else letter
        lines.append(f'    <li><a href="#{anchor}">{esc(shown)}</a></li>')
    lines += ["  </ul>", "</nav>", '<div id="glossary-list" class="glossary-list">']
    for letter in letters:
        anchor = "letter-other" if letter == "#" else f"letter-{letter.lower()}"
        shown = "Other" if letter == "#" else letter
        lines.append(f'<section class="glossary-group" id="{anchor}" data-filter-group>')
        lines.append(f"  <h2>{esc(shown)}</h2>")
        for term in groups[letter]:
            lines.extend("  " + line for line in entry_lines(term, ctx))
        lines.append("</section>")
    lines.append("</div>")
    lines.append(f'<p class="glossary-count" data-glossary-count>{len(ctx.terms)} terms</p>')
    return lines


def splice(text: str, page: str, lines: list[str]) -> str:
    """Replaces the body of the region. The author's closing marker is kept as written."""
    pattern = re.compile(
        rf"<!-- gen:{REGION} -->(?P<body>.*?)(?P<close><!-- /gen(?::{REGION})? -->)", re.S
    )
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise GenError(
            f"{page}: region {REGION!r} has {len(matches)} marker pairs (need exactly 1)"
        )
    match = matches[0]
    line_start = text.rfind("\n", 0, match.start()) + 1
    lead = re.match(r"[ \t]*", text[line_start : match.start()])
    indent = lead.group(0) if lead else ""
    body = "\n".join(indent + line if line else "" for line in lines)
    return (
        text[: match.start()]
        + f"<!-- gen:{REGION} -->\n"
        + body
        + "\n"
        + indent
        + match.group("close")
        + text[match.end() :]
    )


def page_text(root: Path, lines: list[str]) -> tuple[str, str]:
    path = root / "site" / PAGE
    if not path.is_file():
        raise GenError(f"missing page {path}")
    text = path.read_text(encoding="utf-8")
    return text, splice(text, PAGE, lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the glossary list of the HARNESSED site."
    )
    parser.add_argument("--check", action="store_true", help="report a stale page; write nothing")
    parser.add_argument(
        "--root", type=Path, default=REPO, help="repository root (tests use a copy)"
    )
    args = parser.parse_args(argv)
    root: Path = args.root
    try:
        ctx = load(root)
        old, new = page_text(root, render_region(ctx))
    except GenError as err:
        print(f"gen_glossary: {err}", file=sys.stderr)
        return 2
    count = len(ctx.terms)
    if old == new:
        print(f"gen_glossary: {count} terms, page up to date")
        return 0
    if args.check:
        print(f"stale: site/{PAGE} (run python tools/gen_glossary.py)", file=sys.stderr)
        print(f"gen_glossary: {count} terms, page stale")
        return 1
    (root / "site" / PAGE).write_text(new, encoding="utf-8")
    print(f"gen_glossary: {count} terms, page written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
