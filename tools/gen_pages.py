#!/usr/bin/env python3
"""Generate the static regions of site/index.html and site/design.html from the site data.

Usage: python tools/gen_pages.py [--check] [--root DIR]

A generated region sits between `<!-- gen:NAME -->` and `<!-- /gen:NAME -->` marker lines.
Everything outside the markers is hand-written and left alone. Inputs under DIR:
site/data/course.json and facts.json, site/assets/core/glyphs.svg and tokens.css, and whether
site/modules/<slug>.html exists. A module whose page is not built renders as text with "soon",
and its Continue and shift keys are disabled.

Writes the pages unless --check is given. With --check nothing is written: a page whose regions
differ from the generated text is stale and the exit status is 1. Exit status 2 means an input
or a marker is missing or repeated. The last line is the summary.
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

Json = dict[str, Any]

EXAMPLE_FACT = "api.effort-five-levels"

LINE_DASH: dict[str, tuple[str, float, bool]] = {
    "solid": ("", 2.0, False),
    "10 4": ("10 4", 2.0, False),
    "solid-heavy": ("", 3.5, False),
    "8 3 2 3": ("8 3 2 3", 2.0, False),
    "4 3": ("4 3", 2.0, False),
    "8 3 2 3 2 3": ("8 3 2 3 2 3", 2.0, False),
    "0.1 4": ("0.1 4", 2.5, True),
    "2 2": ("2 2", 1.5, False),
}
LINE_NAME: dict[str, str] = {
    "solid": "solid 2 px",
    "10 4": "long dash",
    "solid-heavy": "solid 3.5 px",
    "8 3 2 3": "dash-dot",
    "4 3": "short dash",
    "8 3 2 3 2 3": "dash-dot-dot",
    "0.1 4": "dotted, round caps",
    "2 2": "fine dash",
}
EVENT_GLYPHS: list[tuple[str, str]] = [
    ("play", "run start"),
    ("flag", "run end"),
    ("layers", "prompt built"),
    ("box", "model call"),
    ("box-filled", "model reply"),
    ("zigzag", "model error"),
    ("hourglass", "retry wait"),
    ("switch-closed", "breaker"),
    ("hexagon", "tool call"),
    ("hexagon-fail", "tool failed"),
    ("permission-allow", "permission: allow"),
    ("permission-ask", "permission: ask"),
    ("permission-deny", "permission: deny"),
    ("squeeze", "compaction"),
    ("prefix", "cache prefix"),
    ("window", "context check"),
    ("shield-pass", "verify: pass"),
    ("shield-fail", "verify: fail"),
    ("noentry", "guard"),
    ("pause", "interrupt"),
    ("nested", "subagent"),
    ("eye", "trace write"),
    ("sandbox", "sandbox"),
]
MARK_GLYPHS: list[tuple[str, str]] = [
    ("check", "done"),
    ("cross", "failed"),
    ("bang", "needs attention"),
    ("ext", "external link"),
    ("prog-0", "not started"),
    ("prog-1", "in progress"),
    ("prog-2", "done"),
]
# (token, swatch class, role). Every token must be declared in tokens.css.
SWATCHES: list[tuple[str, str, str]] = [
    ("--hx-paper", "sw-paper", "page background"),
    ("--hx-panel", "sw-panel", "plates and cards"),
    ("--hx-panel-2", "sw-panel-2", "insets, hover, table stripes"),
    ("--hx-grid-minor", "sw-grid", "faint grid, inside instrument plates only"),
    ("--hx-ink", "sw-ink", "text and primary strokes"),
    ("--hx-ink-2", "sw-ink-2", "secondary text, margin notes"),
    ("--hx-rule", "sw-rule", "hairlines, plate borders"),
    ("--hx-rule-strong", "sw-rule-strong", "form-control borders"),
    ("--hx-focus", "sw-focus", "3 px focus ring"),
    ("--hx-inst", "sw-inst", "readout windows, dark in both themes"),
    ("--hx-inst-amber", "sw-inst-amber", "live readout values"),
    ("--hx-scrub", "sw-scrub", "interactive-number highlight"),
    ("--hx-code-bg", "sw-code", "code and Wire JSON"),
    ("--hx-pass", "sw-pass", "pass, always with a mark and a word"),
    ("--hx-fail", "sw-fail", "fail, always with a mark and a word"),
    ("--hx-warn", "sw-warn", "warnings"),
]

INDEX_REGIONS: tuple[str, ...] = (
    "continue",
    "shift",
    "page",
    "legend",
    "caption",
    "path",
    "course-map",
)
DESIGN_REGIONS: tuple[str, ...] = (
    "wires",
    "glyph-wires",
    "glyph-events",
    "glyph-marks",
    "swatches",
    "fact",
)
# The top bar (with its Menu sheet) and the footer (with the facts line): every shell page (BP-5.3).
CHROME_REGIONS: tuple[str, ...] = ("topbar", "footer")
PAGES: dict[str, tuple[str, ...]] = {
    "index.html": INDEX_REGIONS + CHROME_REGIONS,
    "design.html": DESIGN_REGIONS + CHROME_REGIONS,
    "glossary.html": CHROME_REGIONS,
    "readiness.html": CHROME_REGIONS,
    "oncall.html": CHROME_REGIONS,
}
# The top-level pages, in the order they are written.
TOP_PAGES: tuple[str, ...] = (
    "index.html", "design.html", "glossary.html", "readiness.html", "oncall.html",
)
# Regions another generator owns on a page this module also writes: gen_glossary fills the list on
# glossary.html.
FOREIGN_REGIONS: dict[str, tuple[str, ...]] = {"glossary.html": ("glossary",)}
# Regions a migration retires. The home and design pages' facts region sat inside their footer;
# the footer region carries the facts line now, so the migration removes the old region with it.
RETIRED_REGIONS: dict[str, tuple[str, ...]] = {"index.html": ("facts",), "design.html": ("facts",)}
MODULE_REGIONS: tuple[str, ...] = ("module-meta", "course-map") + CHROME_REGIONS
# The Next link at the end of a module on the course path (BP-7.2 B1). Off the path, no region.
NEXT_REGION = "next"
RAIL_TAG = '<aside class="rail"'
BEAT_LABEL: dict[str, str] = {
    "break": "Break",
    "see": "See",
    "fix": "Fix",
    "prove": "Prove",
    "keep": "Keep",
    "lab": "Lab",
    "check": "Check",
    "do": "Do",
}


def regions_for(page: str) -> tuple[str, ...]:
    """The generated regions of a page: those of index and design, or the two of a module page."""
    return PAGES.get(page, MODULE_REGIONS)


class GenError(Exception):
    """An input or a marker is missing, or a marker is repeated."""


@dataclass(frozen=True)
class Data:
    course: Json
    facts: Json
    glyphs: dict[str, list[str]]
    tokens: frozenset[str]
    built: frozenset[str]


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def read_json(path: Path) -> Any:
    if not path.is_file():
        raise GenError(f"missing input {path}")
    value: Any = json.loads(path.read_text(encoding="utf-8"))
    return value


def read_glyphs(path: Path) -> dict[str, list[str]]:
    if not path.is_file():
        raise GenError(f"missing input {path}")
    root = ET.parse(path).getroot()
    glyphs: dict[str, list[str]] = {}
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        ident = element.get("id") or ""
        if tag == "symbol" and ident.startswith("g-"):
            paths = [
                child.get("d", "")
                for child in element.iter()
                if child.tag.rsplit("}", 1)[-1] == "path" and child.get("d")
            ]
            glyphs[ident[2:]] = paths
    return glyphs


def read_tokens(path: Path) -> frozenset[str]:
    if not path.is_file():
        raise GenError(f"missing input {path}")
    names = re.findall(r"^\s*(--[a-z0-9-]+)\s*:", path.read_text(encoding="utf-8"), re.M)
    return frozenset(names)


def load(root: Path) -> Data:
    site = root / "site"
    course: Json = read_json(site / "data" / "course.json")
    facts: Json = read_json(site / "data" / "facts.json")
    glyphs = read_glyphs(site / "assets" / "core" / "glyphs.svg")
    tokens = read_tokens(site / "assets" / "core" / "tokens.css")
    built = frozenset(
        m["slug"] for m in course["modules"] if (site / "modules" / f"{m['slug']}.html").is_file()
    )
    return Data(course=course, facts=facts, glyphs=glyphs, tokens=tokens, built=built)


# ---- course model -------------------------------------------------------------------------------


def modules_by_id(d: Data) -> dict[str, Json]:
    return {m["id"]: m for m in d.course["modules"]}


def families_by_id(d: Data) -> dict[str, Json]:
    return {f["id"]: f for f in d.course["failure_families"]}


def part_order(d: Data) -> list[str]:
    return [p["id"] for p in d.course["parts"]]


def part_title(d: Data, part_id: str) -> str:
    for p in d.course["parts"]:
        if p["id"] == part_id:
            return str(p["title"])
    raise GenError(f"unknown part {part_id}")


def check_course_refs(d: Data) -> None:
    mods = modules_by_id(d)
    for mod in d.course["modules"]:
        tag = mod.get("tag")
        if tag and tag.get("wire") not in (mod.get("wires") or []):
            raise GenError(
                f"module {mod['id']}: its tag wire {tag.get('wire')!r} is not one of its wires"
            )
    table = comes_in(d)
    for wire in d.course["wires"]:
        if wire["id"] not in table:
            raise GenError(f"no tagged module comes in on wire {wire['id']}")
        if wire["line"] not in LINE_DASH or wire["line"] not in LINE_NAME:
            raise GenError(f"wire {wire['id']} has an unknown line style {wire['line']!r}")
        if wire["glyph"] not in d.glyphs:
            raise GenError(f"wire {wire['id']} uses glyph {wire['glyph']!r}, not in glyphs.svg")
    del mods


def comes_in(d: Data) -> dict[str, str]:
    """The comes-in module of each wire: the first module on the path with a tag on it (D-043)."""
    mods = modules_by_id(d)
    table: dict[str, str] = {}
    for mid in d.course["path"]:
        tag = mods.get(mid, {}).get("tag")
        if tag and tag.get("wire") not in table:
            table[tag["wire"]] = mid
    return table


def clock_label(clock: str) -> str:
    if clock.endswith(" (rim)"):
        return f"{clock[: -len(' (rim)')]} o'clock (rim)"
    return f"{clock} o'clock"


def wire_meta(wire: Json) -> str:
    note = " (the hand)" if wire["id"] == "loop" else ""
    return (
        f"{clock_label(wire['clock'])}{note} · {wire['angle']}° · "
        f"{LINE_NAME[wire['line']]} · glyph {wire['glyph']}"
    )


def comes_in_text(d: Data, wire_id: str) -> str:
    return f"comes in {comes_in(d)[wire_id]}"


def module_state(d: Data, wire_id: str) -> str:
    """A new learner's board is empty: each spoke says where its module comes in, and what it is."""
    mod = modules_by_id(d)[comes_in(d)[wire_id]]
    return f"Empty: {comes_in_text(d, wire_id)} · {mod['title']}"


def oldest_fact_date(d: Data) -> str:
    dates = [str(f["verified_on"]) for f in d.facts.values() if f.get("verified_on")]
    if not dates:
        raise GenError("facts.json has no verified_on dates")
    return min(dates)


def fact_claim(d: Data, fact_id: str) -> tuple[str, str]:
    fact = d.facts.get(fact_id)
    if fact is None:
        raise GenError(f"fact {fact_id} is not in facts.json")
    if fact.get("status") != "verified":
        raise GenError(f"fact {fact_id} is not verified")
    return str(fact["claim"]), str(fact["verified_on"])


# ---- JSON islands and small renderers (bodies use relative indentation) -------------------------


def caption_lines(d: Data) -> list[str]:
    """The learner's board caption for a new learner (the hx-clock fallback sentence)."""
    del d
    return [
        '<p class="clock-caption">Your board is empty. Each module you finish plugs a tag '
        "onto its wire.</p>",
        '<p class="clock-note">Codes like C9 name modules. The course map lists them all.</p>',
    ]


def legend_rows(d: Data) -> list[str]:
    lines = ['<ol class="legend" aria-label="Wires in turn order">']
    for wire in d.course["wires"]:
        wid = wire["id"]
        state = module_state(d, wid)
        lines += [
            f'  <li class="legend-row w-{wid}">'
            f'<span class="legend-n">{wire["n"]}</span>'
            f'<svg class="legend-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            f'<use href="assets/core/glyphs.svg#g-{wire["glyph"]}"/></svg>'
            '<span class="legend-text">'
            f'<span class="legend-name">{esc(wire["name"])}, '
            f"{esc(clock_label(wire['clock']))}</span>"
            f'<span class="legend-state">{esc(state)}</span>'
            "</span></li>"
        ]
    lines.append("</ol>")
    return lines


def path_rows(d: Data) -> list[str]:
    counts: dict[str, int] = {}
    for mod in d.course["modules"]:
        counts[mod["part"]] = counts.get(mod["part"], 0) + 1
    lines: list[str] = []
    for part in part_order(d):
        lines.append(
            f'<li class="path-row" data-part-row="{part}">'
            '<svg class="path-mark is-ahead" viewBox="0 0 24 24" aria-hidden="true" '
            'focusable="false">'
            '<circle cx="12" cy="12" r="9"/></svg>'
            f'<span class="path-name">Part {part} · {esc(part_title(d, part))}</span>'
            f'<span class="path-count">0 of {counts.get(part, 0)} · ahead</span></li>'
        )
    return lines


def module_label(d: Data, mod: Json) -> str:
    return f"{mod['id']} · {mod['title']}"


def course_map_lines(d: Data, prefix: str = "modules/", current: str | None = None) -> list[str]:
    """The course map. prefix: the path from the page to the module folder ("" on module pages)."""
    path_pos = {mid: i for i, mid in enumerate(d.course["path"])}
    fams = families_by_id(d)
    lines: list[str] = []
    for part in part_order(d):
        mods = [m for m in d.course["modules"] if m["part"] == part]
        lines.append(
            f'<section class="map-part" data-part-id="{part}" '
            f'data-part-title="{esc(part_title(d, part))}">'
        )
        lines.append(f"  <h3><span>Part {part} · {esc(part_title(d, part))}</span></h3>")
        count = f"{len(mods)} module" + ("" if len(mods) == 1 else "s")
        lines.append(f'  <p class="map-count" data-part-count>{count}</p>')
        lines.append('  <ol class="map-modules">')
        for mod in mods:
            attrs = [
                f'data-module-id="{mod["id"]}"',
                f'data-slug="{mod["slug"]}"',
                f'data-part="{part}"',
                f'data-title="{esc(mod["title"])}"',
                f'data-minutes="{mod["minutes"]}"',
            ]
            fam = fams.get(mod.get("family") or "")
            if fam:
                attrs += [
                    f'data-family="{fam["id"]}"',
                    f'data-family-name="{esc(fam["name"])}"',
                    f'data-family-summary="{esc(fam["summary"])}"',
                ]
            if mod["id"] in path_pos:
                attrs.append(f'data-path="{path_pos[mod["id"]]}"')
            built = mod["slug"] in d.built
            attrs.append(f'data-built="{"true" if built else "false"}"')
            label = esc(module_label(d, mod))
            mark = (
                '<span class="module-mark" aria-hidden="true">'
                '<svg class="path-mark is-ahead" viewBox="0 0 24 24" aria-hidden="true" '
                'focusable="false">'
                '<circle cx="12" cy="12" r="9"/></svg></span>'
            )
            if built:
                current_attr = ' aria-current="page"' if mod["slug"] == current else ""
                body = (
                    f'{mark}<a class="module-label" href="{prefix}{mod["slug"]}.html"'
                    f"{current_attr}>{label}</a>"
                )
            else:
                body = (
                    f'{mark}<span class="module-label">{label}</span><span class="soon">soon</span>'
                )
            lines.append(f"    <li {' '.join(attrs)}>{body}</li>")
        lines.append("  </ol>")
        lines.append("</section>")
    return lines


def module_by_slug(d: Data, slug: str) -> Json:
    for mod in d.course["modules"]:
        if mod["slug"] == slug:
            found: Json = mod
            return found
    raise GenError(f"module page {slug}.html has no module in course.json")


def module_pages(root: Path) -> list[str]:
    """The slugs of the module pages that exist (site/modules/*.html)."""
    folder = root / "site" / "modules"
    if not folder.is_dir():
        return []
    return sorted(path.stem for path in folder.glob("*.html"))


def module_meta_lines(d: Data, mod: Json) -> list[str]:
    """A module page's header: wire chips, minutes, objectives, progress, prereqs, beat strip."""
    base = "../"
    mods = modules_by_id(d)
    wires = {w["id"]: w for w in d.course["wires"]}
    first = mod["wires"][0] if mod["wires"] else None
    glyph = wires[first]["glyph"] if first else ""
    total = len(mod["objectives"])
    lines = [
        f'<div class="module-meta" data-module-id="{mod["id"]}" data-glyph="{glyph}">',
        '  <ul class="wire-chips">',
    ]
    for wid in mod["wires"]:
        wire = wires[wid]
        lines.append(
            f'    <li class="w-{wid}"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" '
            f'focusable="false"><use href="{base}assets/core/glyphs.svg#g-{wire["glyph"]}"/></svg>'
            f"<span>{esc(wire['name'])}</span></li>"
        )
    lines += [
        "  </ul>",
        f'  <p class="module-minutes">{mod["minutes"]} minutes</p>',
        '  <p class="meta-label">By the end you can</p>',
        f'  <ol class="objectives" data-objective-list data-objectives-total="{total}">',
    ]
    for obj in mod["objectives"]:
        lines.append(f'    <li data-objective="{obj["id"]}">{esc(obj["text"])}</li>')
    lines += [
        "  </ol>",
        f'  <p class="progress-line" data-progress><span data-progress-text>0 of {total} '
        "objectives done</span></p>",
    ]
    if mod["prereqs"]:
        parts = []
        for pid in mod["prereqs"]:
            pre = mods[pid]
            label = esc(module_label(d, pre))
            if pre["slug"] in d.built:
                parts.append(f'<a href="{pre["slug"]}.html">{label}</a>')
            else:
                parts.append(f'<span>{label} <span class="soon">soon</span></span>')
        lines.append(f'  <p class="prereqs">Before this: {", ".join(parts)}</p>')
    beats = d.course["kinds"][mod["kind"]]["beats"]
    lines += [
        '  <nav class="beat-strip" aria-label="Beats in this module" data-beat-strip>',
        "    <ol>",
    ]
    for number, beat in enumerate(beats, start=1):
        lines.append(
            f'      <li><a href="#{beat}" data-beat-link="{beat}">'
            f"{number} {BEAT_LABEL[beat]}</a></li>"
        )
    lines += ["    </ol>", "  </nav>", "</div>"]
    return lines


def next_lines(d: Data, mod: Json) -> list[str] | None:
    """The Next link at the end of a module on the path: the next module's page, or on the last
    module a link back to the course map. None for a module off the path."""
    path: list[str] = d.course["path"]
    if mod["id"] not in path:
        return None
    index = path.index(mod["id"])
    if index == len(path) - 1:
        link = '<a class="btn" href="../index.html">Back to the course map</a>'
    else:
        nxt = modules_by_id(d)[path[index + 1]]
        label = esc(f"Next: {nxt['id']} · {nxt['title']}")
        if nxt["slug"] in d.built:
            link = f'<a class="btn" href="{nxt["slug"]}.html">{label}</a>'
        else:
            link = (
                f'<span class="btn" aria-disabled="true">{label} '
                '<span class="soon">soon</span></span>'
            )
    return [f'<nav class="module-next" aria-label="Next on the path">{link}</nav>']


def render_module(d: Data, slug: str) -> dict[str, list[str]]:
    mod = module_by_slug(d, slug)
    regions = {
        "module-meta": module_meta_lines(d, mod),
        "course-map": course_map_lines(d, prefix="", current=slug),
    }
    nxt = next_lines(d, mod)
    if nxt is not None:
        regions[NEXT_REGION] = nxt
    regions.update(render_chrome(d, f"modules/{slug}.html"))
    return regions


def facts_line(d: Data) -> str:
    iso = oldest_fact_date(d)
    return (
        f"<p data-facts-line>Facts verified as of "
        f'<span data-facts-oldest data-facts-oldest-iso="{iso}">'
        f"{iso}</span>.</p>"
    )


def next_module(d: Data) -> Json:
    first = d.course["path"][0]
    return modules_by_id(d)[first]


def continue_lines(d: Data) -> list[str]:
    mod = next_module(d)
    built = mod["slug"] in d.built
    link = (
        f'<a class="btn btn-primary" data-continue-link '
        f'href="modules/{mod["slug"]}.html">Continue</a>'
        if built
        else (
            '<a class="btn btn-primary" data-continue-link aria-disabled="true">'
            f"{esc(mod['id'])} opens soon</a>"
        )
    )
    note_hidden = " hidden" if built else ""
    return [
        f'<h2 id="continue-h" data-continue-title>{esc(module_label(d, mod))}</h2>',
        f'<p class="meta" data-continue-meta>{mod["minutes"]} minutes · Part {mod["part"]}</p>',
        link,
        f'<p class="meta" data-soon-note{note_hidden}>{esc(mod["id"])} opens soon. '
        "Its page is not built yet.</p>",
    ]


def shift_lines(d: Data) -> list[str]:
    mod = next_module(d)
    fam = families_by_id(d)[mod["family"]]
    # Today's shift is one page for the whole course (oncall.html, BP-5.4 §4), not a module's page.
    link = '<a class="btn" data-family-link href="oncall.html">Start shift</a>'
    return [
        '<ul class="shift-list">',
        f'  <li>1 incident: <span data-slot="family-name">{esc(fam["name"])}</span></li>',
        "  <li><span data-due>0</span> cards due today</li>",
        "</ul>",
        f'<p class="meta" data-slot="family-summary">{esc(fam["summary"])}</p>',
        link,
    ]


def page_lines(d: Data) -> list[str]:
    mod = next_module(d)
    fam = families_by_id(d)[mod["family"]]
    return [
        f'<h2>PAGE · <span data-slot="family-name">{esc(fam["name"])}</span></h2>',
        f'<p class="lede" data-slot="family-summary">{esc(fam["summary"])}</p>',
    ]


def wire_rows(d: Data) -> list[str]:
    lines = ['<ol class="wire-rows">']
    for wire in d.course["wires"]:
        wid = wire["id"]
        lines += [
            f'  <li class="w-{wid}"><span class="sw-wire w-{wid}" aria-hidden="true"></span>'
            f'<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            f'<use href="assets/core/glyphs.svg#g-{wire["glyph"]}"/></svg>'
            f'<span><span class="wire-name">{esc(wire["name"])}</span>'
            f'<span class="wire-meta">{esc(wire_meta(wire))}</span></span></li>'
        ]
    lines.append("</ol>")
    return lines


def glyph_grid(d: Data, items: list[tuple[str, str, str]]) -> list[str]:
    """items are (glyph name, label, li class). The glyph is looked up, so a missing name fails."""
    lines = ['<ul class="glyph-grid">']
    for name, label, cls in items:
        if name not in d.glyphs:
            raise GenError(f"glyph {name!r} is not in glyphs.svg")
        cls_attr = f' class="{cls}"' if cls else ""
        lines.append(
            f'  <li{cls_attr}><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" '
            'focusable="false">'
            f'<use href="assets/core/glyphs.svg#g-{name}"/></svg><span>{esc(label)}</span></li>'
        )
    lines.append("</ul>")
    return lines


def swatch_lines(d: Data) -> list[str]:
    lines = ['<ul class="swatches">']
    for token, cls, role in SWATCHES:
        if token not in d.tokens:
            raise GenError(f"{token} is not declared in tokens.css")
        lines.append(
            f'  <li><span class="swatch-chip {cls}" aria-hidden="true"></span>'
            f'<span class="name">{token}</span><span class="role">{esc(role)}</span></li>'
        )
    lines.append("</ul>")
    return lines


def fact_line(d: Data) -> str:
    claim, verified = fact_claim(d, EXAMPLE_FACT)
    return (
        f'<span class="fact" data-fact="{EXAMPLE_FACT}" data-verified="{verified}">'
        f"{esc(claim)}</span>"
    )


def render_index(d: Data) -> dict[str, list[str]]:
    return {
        "continue": continue_lines(d),
        "shift": shift_lines(d),
        "page": page_lines(d),
        "legend": legend_rows(d),
        "caption": caption_lines(d),
        "path": path_rows(d),
        "course-map": course_map_lines(d),
        **render_chrome(d, "index.html"),
    }


def render_design(d: Data) -> dict[str, list[str]]:
    return {
        "wires": wire_rows(d),
        "glyph-wires": glyph_grid(
            d, [(w["glyph"], w["name"], f"w-{w['id']}") for w in d.course["wires"]]
        ),
        "glyph-events": glyph_grid(d, [(name, label, "") for name, label in EVENT_GLYPHS]),
        "glyph-marks": glyph_grid(d, [(name, label, "") for name, label in MARK_GLYPHS]),
        "swatches": swatch_lines(d),
        "fact": [fact_line(d)],
        **render_chrome(d, "design.html"),
    }


# ---- the chrome: the top bar with its Menu sheet, and the footer (BP-5.3) -----------------------

NAV: tuple[tuple[str, str, str], ...] = (
    ("course", "Course", "index.html"),
    ("glossary", "Glossary", "glossary.html"),
    ("readiness", "Readiness", "readiness.html"),
)
# The page-nav entry that is current on each top-level page. Module pages are part of the course.
CURRENT_NAV: dict[str, str | None] = {
    "index.html": "course",
    "glossary.html": "glossary",
    "readiness.html": "readiness",
    "design.html": None,
    "oncall.html": None,
}
TOPBAR_BLOCK = re.compile(
    r'[ \t]*<header class="topbar"[^>]*>.*?</header>\n'
    r'(?:[ \t]*<dialog class="menu-sheet"[^>]*>.*?</dialog>\n)?',
    re.S,
)
FOOTER_BLOCK = re.compile(r'[ \t]*<footer class="footer"[^>]*>.*?</footer>\n', re.S)
SKIP_LINK = re.compile(r'^[ \t]*<a class="skip"[^\n]*</a>\n', re.M)


def chrome_prefix(page: str) -> str:
    """Links from a module page climb one folder to the site root."""
    return "../" if page.startswith("modules/") else ""


def module_slug(page: str) -> str:
    return page[len("modules/") : -len(".html")]


def nav_lines(prefix: str, current: str | None, indent: str) -> list[str]:
    lines: list[str] = []
    for key, label, target in NAV:
        aria = ' aria-current="page"' if key == current else ""
        lines.append(f'{indent}<li><a href="{prefix}{target}"{aria}>{label}</a></li>')
    return lines


def topbar_lines(d: Data, page: str) -> list[str]:
    prefix = chrome_prefix(page)
    current = "course" if page.startswith("modules/") else CURRENT_NAV.get(page)
    lines = [
        '<header class="topbar" data-topbar>',
        f'  <a class="wordmark" href="{prefix}index.html" aria-label="HARNESSED, course home">',
        '    <svg class="connector" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        '<circle cx="12" cy="12" r="9"/><path d="M12 12V4"/><path d="M12 12l5 3"/></svg>',
        "    <span>HARNESSED</span>",
        "  </a>",
    ]
    if page.startswith("modules/"):
        mod = module_by_slug(d, module_slug(page))
        lines.append(
            f'  <p class="module-id"><span class="mod-code">{esc(str(mod["id"]))}</span>'
            f'<span class="mod-title">{esc(str(mod["title"]))}</span></p>'
        )
    lines += [
        '  <nav class="top-nav" aria-label="Pages">',
        "    <ol>",
        *nav_lines(prefix, current, "      "),
        "    </ol>",
        "  </nav>",
        f'  <a class="board-btn" href="{prefix}index.html#board" '
        'aria-label="Board, 0 cards due" data-due-label>',
        '    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        '<circle cx="12" cy="12" r="9" '
        'fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12V6" fill="none" '
        'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        '    <span><span class="board-word">Board · </span>'
        '<span data-due-num>0</span>'
        '<span class="board-due" data-due-words> cards due</span></span>',
        "  </a>",
        '  <div class="settings">',
        "    <div data-theme-slot></div>",
        "    <div data-motion-slot></div>",
        "  </div>",
        '  <button class="menu-btn" type="button" data-menu-btn aria-haspopup="dialog" '
        'aria-expanded="false" aria-controls="menu-sheet" hidden>Menu</button>',
        "</header>",
        '<dialog class="menu-sheet" id="menu-sheet" data-menu-sheet aria-label="Menu">',
        '  <p class="menu-title">Menu</p>',
        '  <nav aria-label="Pages in the menu">',
        '    <ol class="menu-pages">',
        *nav_lines(prefix, current, "      "),
        "    </ol>",
        "  </nav>",
        '  <div class="menu-settings">',
        '    <p class="menu-label">Theme</p>',
        "    <div data-theme-slot></div>",
        "    <div data-motion-slot></div>",
        "  </div>",
        '  <button class="key menu-close" type="button" data-close>Close menu</button>',
        "</dialog>",
    ]
    return lines


def footer_lines(d: Data, page: str) -> list[str]:
    prefix = chrome_prefix(page)
    return [
        '<footer class="footer">',
        '  <div class="footer-grid">',
        '    <p class="live-status" data-store-status></p>',
        '    <div class="footer-actions">',
        '      <button class="btn" type="button" data-export>Export progress</button>',
        '      <label class="btn">Import progress<input class="sr-only" type="file" '
        'accept="application/json,.json" data-import></label>',
        '      <button class="btn btn-quiet" type="button" data-reset>'
        'Reset progress (keeps settings)</button>',
        "    </div>",
        f'    <p><a href="{prefix}design.html">Design system</a></p>',
        f"    <p>Fonts: Newsreader (SIL OFL 1.1). Harnessed Sans and Harnessed Mono (SIL OFL 1.1; "
        f'renamed IBM Plex subsets). Licences in '
        f'<a href="{prefix}assets/fonts/LICENSE-OFL.txt">LICENSE-OFL.txt</a> and '
        f'<a href="{prefix}assets/fonts/LICENSE-newsreader.txt">LICENSE-newsreader.txt</a>.</p>',
        f"    {facts_line(d)}",
        "  </div>",
        "</footer>",
    ]


def render_chrome(d: Data, page: str) -> dict[str, list[str]]:
    return {"topbar": topbar_lines(d, page), "footer": footer_lines(d, page)}


# ---- splicing -----------------------------------------------------------------------------------


def splice(text: str, page: str, region: str, lines: list[str]) -> str:
    """Replaces the body of one region. The author's closing marker is kept as written."""
    name = re.escape(region)
    pattern = re.compile(
        rf"<!-- gen:{name} -->(?P<body>.*?)(?P<close><!-- /gen(?::{name})? -->)", re.S
    )
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise GenError(
            f"{page}: region {region!r} has {len(matches)} marker pairs (need exactly 1)"
        )
    match = matches[0]
    line_start = text.rfind("\n", 0, match.start()) + 1
    lead = re.match(r"[ \t]*", text[line_start : match.start()])
    indent = lead.group(0) if lead else ""
    body = "\n".join(indent + line if line else "" for line in lines)
    return (
        text[: match.start()]
        + f"<!-- gen:{region} -->\n"
        + body
        + "\n"
        + indent
        + match.group("close")
        + text[match.end() :]
    )


def marker_pair(region: str) -> str:
    return f"<!-- gen:{region} -->\n<!-- /gen:{region} -->\n"


def migrate_next(text: str, page: str) -> str:
    """Adds the Next region's markers on a module page on the path, before the course rail (the
    region follows the last beat). Idempotent: a page with the markers is left alone."""
    if f"<!-- gen:{NEXT_REGION} -->" in text:
        return text
    at = text.find(RAIL_TAG)
    if at < 0:
        raise GenError(f"{page}: no place for the {NEXT_REGION} region (no {RAIL_TAG!r})")
    start = text.rfind("\n", 0, at) + 1
    lead = re.fullmatch(r"[ \t]*", text[start:at])
    if lead is None:
        raise GenError(f"{page}: the course rail does not start its line")
    indent = lead.group(0)
    markers = f"{indent}<!-- gen:{NEXT_REGION} -->\n{indent}<!-- /gen:{NEXT_REGION} -->\n"
    return text[:start] + markers + text[start:]


def place_markers(text: str, page: str, region: str, block: re.Pattern[str],
                  anchor: re.Pattern[str] | None, fallback: str) -> str:
    """A hand-written block is replaced by the region's markers. Without one, the markers go after
    the anchor, or before the fallback text."""
    found = block.search(text)
    if found:
        return text[: found.start()] + marker_pair(region) + text[found.end() :]
    if anchor is not None:
        found_anchor = anchor.search(text)
        if found_anchor:
            return text[: found_anchor.end()] + marker_pair(region) + text[found_anchor.end() :]
    at = text.find(fallback)
    if at < 0:
        raise GenError(f"{page}: no place for the {region} region (no {fallback!r})")
    return text[:at] + marker_pair(region) + text[at:]


def migrate_chrome(text: str, page: str) -> str:
    """Adds the chrome markers to a page that lacks them. A page with a hand-written top bar (and
    its Menu sheet) or footer has that block replaced by the markers, and the generator fills them.
    Idempotent: a page with the markers is left alone, so the migration can run on every page."""
    if "<!-- gen:topbar -->" not in text:
        text = place_markers(text, page, "topbar", TOPBAR_BLOCK, SKIP_LINK, "<main")
    if "<!-- gen:footer -->" not in text:
        text = place_markers(text, page, "footer", FOOTER_BLOCK, None, "</body>")
    return text


def page_text(root: Path, page: str, regions: dict[str, list[str]]) -> tuple[str, str]:
    path = root / "site" / page
    if not path.is_file():
        raise GenError(f"missing page {path}")
    text = path.read_text(encoding="utf-8")
    markers = set(re.findall(r"<!-- gen:([a-z-]+) -->", text))
    # A module page's regions depend on its place on the path, so its render says which it has.
    expected = tuple(regions) if page.startswith("modules/") else regions_for(page)
    known = set(expected) | set(FOREIGN_REGIONS.get(page, ())) | set(RETIRED_REGIONS.get(page, ()))
    unknown = markers - known
    if unknown:
        raise GenError(f"{page}: unknown generated region(s) {sorted(unknown)}")
    new = migrate_chrome(text, page)
    if NEXT_REGION in expected:
        new = migrate_next(new, page)
    for region in expected:
        new = splice(new, page, region, regions[region])
    return text, new


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the static regions of the HARNESSED pages."
    )
    parser.add_argument(
        "--check", action="store_true",
        help="report stale pages (including pages whose markers are missing); write nothing",
    )
    parser.add_argument(
        "--root", type=Path, default=REPO, help="repository root (tests use a copy)"
    )
    args = parser.parse_args(argv)
    root: Path = args.root
    try:
        data = load(root)
        check_course_refs(data)
        rendered: dict[str, dict[str, list[str]]] = {
            "index.html": render_index(data),
            "design.html": render_design(data),
            "glossary.html": render_chrome(data, "glossary.html"),
            "readiness.html": render_chrome(data, "readiness.html"),
            "oncall.html": render_chrome(data, "oncall.html"),
        }
        results: list[tuple[str, str, str]] = []
        for page in TOP_PAGES:
            old, new = page_text(root, page, rendered[page])
            results.append((page, old, new))
        for slug in module_pages(root):
            page = f"modules/{slug}.html"
            old, new = page_text(root, page, render_module(data, slug))
            results.append((page, old, new))
    except GenError as err:
        print(f"gen_pages: {err}", file=sys.stderr)
        return 2
    stale: list[str] = []
    for page, old, new in results:
        if old == new:
            continue
        stale.append(page)
        if not args.check:
            (root / "site" / page).write_text(new, encoding="utf-8")
    if args.check and stale:
        for page in stale:
            print(f"stale: site/{page} (run python tools/gen_pages.py)", file=sys.stderr)
        print(f"gen_pages: {len(stale)} stale page(s)")
        return 1
    verb = "checked" if args.check else "written"
    print(f"gen_pages: {len(results)} pages {verb}, {len(stale)} changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
