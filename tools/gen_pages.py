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

# The comes-in module for each wire and the example plugged modules are set by hand (from the v2
# prototype). course.json has no field for either, so they are checked against it, not derived.
COMES_IN: dict[str, str] = {
    "control": "C1",
    "context": "C2",
    "loop": "B2",
    "errors": "C6",
    "tools": "C7",
    "permissions": "C9",
    "verify": "C11",
    "observe": "H5",
}
EXAMPLE_PLUGGED: dict[str, str] = {"context": "A3", "loop": "A4"}
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
    "clock-data",
    "path",
    "course-map",
    "facts",
)
DESIGN_REGIONS: tuple[str, ...] = (
    "wires",
    "glyph-wires",
    "glyph-events",
    "glyph-marks",
    "swatches",
    "fact",
    "facts",
)
PAGES: dict[str, tuple[str, ...]] = {"index.html": INDEX_REGIONS, "design.html": DESIGN_REGIONS}


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
    for wire, mid in {**COMES_IN, **EXAMPLE_PLUGGED}.items():
        if mid not in mods:
            raise GenError(f"module {mid} (for wire {wire}) is not in course.json")
        if wire not in (mods[mid].get("wires") or []):
            raise GenError(f"module {mid} does not list wire {wire} in course.json")
    wire_ids = {w["id"] for w in d.course["wires"]}
    if wire_ids != set(COMES_IN):
        raise GenError("COMES_IN must name each of the eight wires once")
    for wire in d.course["wires"]:
        if wire["line"] not in LINE_DASH or wire["line"] not in LINE_NAME:
            raise GenError(f"wire {wire['id']} has an unknown line style {wire['line']!r}")
        if wire["glyph"] not in d.glyphs:
            raise GenError(f"wire {wire['id']} uses glyph {wire['glyph']!r}, not in glyphs.svg")


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
    return f"comes in {COMES_IN[wire_id]}"


def plugged_title(d: Data, wire_id: str) -> str:
    mod = modules_by_id(d)[EXAMPLE_PLUGGED[wire_id]]
    return f"{mod['id']} · {mod['title']} is plugged in"


def module_state(d: Data, wire_id: str) -> str:
    if wire_id in EXAMPLE_PLUGGED:
        return plugged_title(d, wire_id)
    return f"Empty: {comes_in_text(d, wire_id)}"


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


def clock_json(d: Data) -> str:
    wires: list[Json] = []
    for wire in d.course["wires"]:
        dash, width, rnd = LINE_DASH[wire["line"]]
        wires.append(
            {
                "id": wire["id"],
                "n": wire["n"],
                "name": wire["name"],
                "short": wire["short"],
                "clock": clock_label(wire["clock"]),
                "angle": wire["angle"],
                "glyph": wire["glyph"],
                "dash": dash,
                "width": width,
                "round": rnd,
            }
        )
    mods = modules_by_id(d)
    glyph_names = sorted({w["glyph"] for w in d.course["wires"]})
    payload: Json = {
        "wires": wires,
        "glyphs": {name: d.glyphs[name] for name in glyph_names},
        "comesIn": {
            wire: {"id": mid, "title": mods[mid]["title"]} for wire, mid in COMES_IN.items()
        },
        "plugged": {
            wire: {"id": mid, "title": mods[mid]["title"]} for wire, mid in EXAMPLE_PLUGGED.items()
        },
    }
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=1)
    text = text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return f'<script type="application/json" id="clock-data">\n{text}\n</script>'


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


def course_map_lines(d: Data) -> list[str]:
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
                body = (
                    f'{mark}<a class="module-label" href="modules/{mod["slug"]}.html">{label}</a>'
                )
            else:
                body = (
                    f'{mark}<span class="module-label">{label}</span><span class="soon">soon</span>'
                )
            lines.append(f"    <li {' '.join(attrs)}>{body}</li>")
        lines.append("  </ol>")
        lines.append("</section>")
    return lines


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
        else '<a class="btn btn-primary" data-continue-link aria-disabled="true">Continue</a>'
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
    built = mod["slug"] in d.built
    link = (
        f'<a class="btn" data-family-link href="modules/{mod["slug"]}.html">Start shift</a>'
        if built
        else '<a class="btn" data-family-link aria-disabled="true">Start shift</a>'
    )
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
        "clock-data": [clock_json(d)],
        "path": path_rows(d),
        "course-map": course_map_lines(d),
        "facts": [facts_line(d)],
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
        "facts": [facts_line(d)],
    }


# ---- splicing -----------------------------------------------------------------------------------


def splice(text: str, page: str, region: str, lines: list[str]) -> str:
    name = re.escape(region)
    pattern = re.compile(
        rf"(?P<head>^[ \t]*<!-- gen:{name} -->)\n.*?\n(?P<tail>[ \t]*<!-- /gen:{name} -->)",
        re.S | re.M,
    )
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise GenError(
            f"{page}: region {region!r} has {len(matches)} marker pairs (need exactly 1)"
        )
    match = matches[0]
    lead = re.match(r"[ \t]*", match.group("head"))
    indent = lead.group(0) if lead else ""
    body = "\n".join(indent + line if line else "" for line in lines)
    return (
        text[: match.start()]
        + match.group("head")
        + "\n"
        + body
        + "\n"
        + match.group("tail")
        + text[match.end() :]
    )


def page_text(root: Path, page: str, regions: dict[str, list[str]]) -> tuple[str, str]:
    path = root / "site" / page
    if not path.is_file():
        raise GenError(f"missing page {path}")
    text = path.read_text(encoding="utf-8")
    markers = set(re.findall(r"<!-- gen:([a-z-]+) -->", text))
    unknown = markers - set(PAGES[page])
    if unknown:
        raise GenError(f"{page}: unknown generated region(s) {sorted(unknown)}")
    new = text
    for region in PAGES[page]:
        new = splice(new, page, region, regions[region])
    return text, new


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the static regions of the HARNESSED pages."
    )
    parser.add_argument("--check", action="store_true", help="report stale pages; write nothing")
    parser.add_argument(
        "--root", type=Path, default=REPO, help="repository root (tests use a copy)"
    )
    args = parser.parse_args(argv)
    root: Path = args.root
    try:
        data = load(root)
        check_course_refs(data)
        rendered = {"index.html": render_index(data), "design.html": render_design(data)}
        results: list[tuple[str, str, str]] = []
        for page in PAGES:
            old, new = page_text(root, page, rendered[page])
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
