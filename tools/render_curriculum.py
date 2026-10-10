"""Render the generated block of docs/CURRICULUM.md from course.json.

course.json is the single source of truth. This script rewrites everything
between the BEGIN/END markers. `--check` exits 1 if the file is stale.

Usage: python tools/render_curriculum.py [--check]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "CURRICULUM.md"
BEGIN = "<!-- BEGIN GENERATED: tools/render_curriculum.py -->"
END = "<!-- END GENERATED -->"


def render(course: dict) -> str:
    mods = course["modules"]
    byid = {m["id"]: m for m in mods}
    wires = {w["id"]: w for w in course["wires"]}
    fams = {f["id"]: f for f in course["failure_families"]}
    c = course["counts"]
    out: list[str] = []
    w = out.append
    w("## Generated from course.json\n")
    w("Do not edit this block by hand: change `course.json`, then run "
      "`python tools/render_curriculum.py`.\n")
    kinds = ", ".join(f"{n} {k}" for k, n in c["modules_by_kind"].items())
    w(f"- **{c['modules']} modules** ({kinds}) in {c['parts']} parts, "
      f"{c['objectives']} objectives, {c['terms_planned']} planned terms, "
      f"{c['failure_families']} failure families.")
    w(f"- Lesson time on the default path: about {round(c['minutes_path'] / 60)} hours "
      f"(all modules including primers: about {round(c['minutes_all'] / 60)} hours), "
      "before practice, portfolio and interview work.\n")

    w("### Default path\n")
    w(" → ".join(course["path"]) + "\n")

    w("### Module map\n")
    for part in course["parts"]:
        pm = [m for m in mods if m["part"] == part["id"]]
        if not pm:
            continue
        w(f"#### Part {part['id']} — {part['title']}\n")
        w("| Code | Module | Kind | Wires | Needs | Min | Law |")
        w("|---|---|---|---|---|---|---|")
        for m in pm:
            ws = " ".join(wires[x]["short"] for x in m["wires"]) or "—"
            pre = ", ".join(m["prereqs"]) or "—"
            vol = " (dated)" if m.get("volatile") else ""
            w(f"| {m['id']} | {m['title']}{vol} | {m['kind']} | {ws} | {pre} | {m['minutes']} | {m['law']} |")
        w("")

    w("### Module details\n")
    for m in mods:
        w(f"#### {m['id']} · {m['title']}\n")
        meta = [f"kind **{m['kind']}**", f"slug `{m['slug']}`"]
        if m.get("family"):
            f = fams[m["family"]]
            meta.append(f"Break incident: *{f['name']}* ({wires[f['wire']]['short']})")
        if m.get("primers"):
            meta.append("primers: " + ", ".join(f"{p} {byid[p]['title']}" for p in m["primers"]))
        if m.get("source"):
            meta.append("book: " + ", ".join(m["source"]))
        w(" · ".join(meta) + "\n")
        w("By the end you can:\n")
        for o in m["objectives"]:
            w(f"- `{o['id']}` {o['text']}")
        w("")
        w("Misconceptions to confront: " + " ".join(m["misconceptions"]) + "\n")
        w("New terms: " + ", ".join(m["terms"]) + ("" if not m.get("local_terms") else
          f" (local re-definitions: {', '.join(m['local_terms'])})") + "\n")
        w("Interactions: " + ", ".join(f"`{i}`" for i in m["interactions"]) + "\n")

    w("### Failure families\n")
    w("| Family | Wire | What happens | Taught in |")
    w("|---|---|---|---|")
    for f in course["failure_families"]:
        w(f"| {f['name']} | {wires[f['wire']]['short']} | {f['summary']} | {f['module']} |")
    w("")
    return "\n".join(out)


def main() -> int:
    course = json.loads((ROOT / "course.json").read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    if BEGIN not in doc or END not in doc:
        print(f"markers missing in {DOC}", file=sys.stderr)
        return 1
    head, rest = doc.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    new = f"{head}{BEGIN}\n{render(course)}\n{END}{tail}"
    if "--check" in sys.argv:
        if new != doc:
            print("docs/CURRICULUM.md is stale: run python tools/render_curriculum.py", file=sys.stderr)
            return 1
        print("CURRICULUM.md generated block is up to date")
        return 0
    DOC.write_text(new, encoding="utf-8")
    print("rendered docs/CURRICULUM.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
