#!/usr/bin/env python3
"""Compile authoring sources into site/data/*.json and refresh the README counts block.

Usage: python tools/gen_data.py [--check]

Writes (D-020): site/data/course.json, facts.json (verified facts only), terms.json,
site/data/{cards,say,checks}/<ID>.json, site/data/katas/<id>.json (from katas/<id>/), and
byte-for-byte copies of the scenario tapes and boards (site/data/scenarios/<id>.json,
site/data/scenarios/boards/<id>.json). Rewrites only the text
between the counts markers in README.md. Generated JSON is written as
json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=True).
With --check nothing is written: stale or missing outputs and unexpected files under site/data
are reported. A source with a problem is not compiled; its problem is reported and the rest
still runs. The last line is the summary.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.lib.course import REPO, Problem, display_path, load_yaml_file  # noqa: E402

BEGIN_COUNTS = "<!-- BEGIN GENERATED: counts -->"
END_COUNTS = "<!-- END GENERATED -->"
CONTENT_KINDS = ("cards", "say", "checks")


@dataclass
class Output:
    rel: str
    text: str


@dataclass
class Plan:
    outputs: list[Output] = field(default_factory=list)
    skipped: set[str] = field(default_factory=set)
    problems: list[Problem] = field(default_factory=list)


def dump_json(value: Any) -> str:
    """The deterministic JSON form used for every generated JSON file."""
    return json.dumps(_jsonable(value), indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def _jsonable(value: Any) -> Any:
    """YAML dates arrive as date objects; write them as ISO strings."""
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def _read_json(path: Path, shown: str, plan: Plan) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        plan.problems.append(Problem(shown, 0, f"cannot read: {exc.strerror}"))
    except json.JSONDecodeError as exc:
        plan.problems.append(Problem(shown, exc.lineno, f"invalid JSON: {exc.msg}"))
    return None


def _yaml_entries(path: Path, plan: Plan) -> list[Any] | None:
    """A YAML file that holds a list (an empty file is an empty list). None on any problem."""
    shown = display_path(path)
    data, problems = load_yaml_file(path, shown)
    if problems:
        plan.problems.extend(problems)
        return None
    if data is None:
        return []
    if not isinstance(data, list):
        plan.problems.append(Problem(shown, 0, "must be a YAML list"))
        return None
    return data


def _facts(root: Path, plan: Plan) -> dict[str, Any] | None:
    folder = root / "facts"
    if not folder.is_dir():
        return {}
    result: dict[str, Any] = {}
    failed = False
    for path in sorted(folder.glob("*.yaml")):
        entries = _yaml_entries(path, plan)
        if entries is None:
            failed = True
            continue
        shown = display_path(path)
        for index, item in enumerate(entries):
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                plan.problems.append(Problem(shown, 0, f"entry {index + 1} needs a string 'id'"))
                failed = True
                continue
            if item.get("status", "verified") != "verified":
                continue
            if item["id"] in result:
                plan.problems.append(Problem(shown, 0, f"duplicate fact id '{item['id']}'"))
                failed = True
                continue
            fact = {k: item[k] for k in ("claim", "source", "verified_on", "volatility")
                    if k in item}
            fact["status"] = item.get("status", "verified")
            for optional in ("kind", "value"):
                if optional in item:
                    fact[optional] = item[optional]
            result[item["id"]] = fact
    return None if failed else result


def _terms(root: Path, plan: Plan) -> dict[str, Any] | None:
    result: dict[str, Any] = {}
    failed = False
    for folder in sorted(p for p in (root / "content").glob("*") if p.is_dir()):
        path = folder / "terms.yaml"
        if not path.is_file():
            continue
        entries = _yaml_entries(path, plan)
        if entries is None:
            failed = True
            continue
        shown = display_path(path)
        for index, item in enumerate(entries):
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                plan.problems.append(Problem(shown, 0, f"entry {index + 1} needs a string 'id'"))
                failed = True
                continue
            if item["id"] in result:
                plan.problems.append(Problem(shown, 0, f"duplicate term id '{item['id']}'"))
                failed = True
                continue
            result[item["id"]] = {**item, "module": folder.name}
    return None if failed else result


def _counts_block(course: dict[str, Any]) -> str:
    counts: dict[str, Any] = course["counts"]
    hours = round(counts["minutes_path"] / 60)
    return (f"- {counts['modules']} modules in {counts['parts']} parts, "
            f"{counts['objectives']} objectives, {counts['failure_families']} failure families, "
            f"about {hours} hours of lessons on the default path.")


def _readme(root: Path, course: dict[str, Any] | None, plan: Plan) -> str | None:
    shown = display_path(root / "README.md")
    path = root / "README.md"
    if not path.is_file():
        plan.problems.append(Problem(shown, 0, "README.md is missing; the counts block is not "
                                               "written (create the file with the markers)"))
        return None
    text = path.read_text(encoding="utf-8")
    if BEGIN_COUNTS not in text or END_COUNTS not in text:
        plan.problems.append(Problem(shown, 0, "README.md is missing the counts markers"))
        return None
    if course is None:
        return None
    head, rest = text.split(BEGIN_COUNTS, 1)
    _, tail = rest.split(END_COUNTS, 1)
    return f"{head}{BEGIN_COUNTS}\n{_counts_block(course)}\n{END_COUNTS}{tail}"


def _step_command(argv: list[str]) -> str:
    """The command as the book prints it: python rein.py, arguments in double quotes when needed."""
    return " ".join(["python", "rein.py"] + [f'"{arg}"' if " " in arg else arg for arg in argv])


def _step_json(step: Any, shared: dict[str, str]) -> dict[str, Any]:
    from tools import check_steps as cs

    breaks = []
    for brk in step.breaks:
        files, argv = cs.apply_change(step, brk.change)
        breaks.append(
            {"id": brk.id, "title": brk.title, "explain": brk.explain, "expected": brk.expected,
             "change": brk.change, "run": {"files": files, "argv": argv}}
        )
    chunks = []
    for chunk in step.chunks:
        hunks = [{"where": h.where, "diff": "".join(sign + body + "\n" for sign, body in h.lines)}
                 for h in chunk.hunks]
        chunks.append(
            {"id": chunk.id, "title": chunk.title, "explain": chunk.explain, "hunks": hunks}
        )
    return {
        "id": step.module, "module": step.module, "number": step.number, "title": step.title,
        "goal": step.goal, "theory": step.theory,
        "requires_python": step.requires_python, "size": step.size,
        "lines_after": step.lines_after, "runs_in_browser": step.runs_in_browser,
        "chunks": chunks,
        "checkpoint": {"command": _step_command(step.argv), "argv": step.argv, "setup": step.setup,
                       "expected": step.expected, "explain": step.explain,
                       "run": {"files": {"rein.py": step.text, **step.scenarios},
                               "argv": step.argv}},
        "breaks": breaks,
        "rein": step.text,
        "scenarios": step.scenarios,
        "shared": {name: shared[name] for name in step.setup},
    }


def _steps(root: Path, plan: Plan) -> None:
    """steps/<ID>/ compiles to site/data/steps/<ID>.json, with the shared setup scripts (BP-2.3).
    The rules about the steps are check_steps.py's; a step it cannot read is named and skipped."""
    from tools import check_steps as cs

    folder = root / "steps"
    if not folder.is_dir():
        return
    shared = cs.load_shared(folder)
    dirs = [
        p for p in folder.iterdir()
        if p.is_dir() and p.name != cs.SHARED and not p.name.startswith(".")
    ]
    for step_dir in sorted(dirs):
        rel = f"site/data/steps/{step_dir.name}.json"
        found: list[Any] = []
        step = cs.load_step(step_dir, found)
        if step is None:
            plan.problems.extend(Problem(item.path, item.line, item.message) for item in found)
            plan.skipped.add(rel)
            continue
        plan.outputs.append(Output(rel, dump_json(_step_json(step, shared))))


def _scenarios(root: Path, plan: Plan) -> None:
    """Tapes and boards are copied byte for byte: key order is part of the prompt the simulator
    builds (tokens are counted over json.dumps without sorting), so they are never re-serialized."""
    folder = root / "scenarios"
    sources = [p for p in sorted(folder.glob("*.json")) if not p.name.endswith("schema.json")]
    sources += sorted((folder / "boards").glob("*.json"))
    for path in sources:
        rel = "site/data/" + path.relative_to(root).as_posix()
        try:
            plan.outputs.append(Output(rel, path.read_text(encoding="utf-8")))
        except OSError as exc:
            plan.problems.append(Problem(display_path(path), 0, f"cannot read: {exc.strerror}"))
            plan.skipped.add(rel)


KATA_FILES = ("starter.py", "solution.py", "test_kata.py")
KATA_KEYS = ("id", "module", "title", "objectives", "minutes", "hints", "from_memory")


def _katas(root: Path, plan: Plan) -> None:
    """katas/<id>/ compiles to site/data/katas/<id>.json (AUTHORING §8). The rules about the
    contents are check_katas.py's; this reads the files and names any it cannot read."""
    folder = root / "katas"
    if not folder.is_dir():
        return
    dirs = [p for p in folder.iterdir() if p.is_dir() and not p.name.startswith(".")]
    for kata_dir in sorted(dirs):
        rel = f"site/data/katas/{kata_dir.name}.json"
        kata = _kata(kata_dir, plan)
        if kata is None:
            plan.skipped.add(rel)
        else:
            plan.outputs.append(Output(rel, dump_json(kata)))


def _kata(kata_dir: Path, plan: Plan) -> dict[str, Any] | None:
    meta_path = kata_dir / "meta.yaml"
    shown = display_path(meta_path)
    if not meta_path.is_file():
        plan.problems.append(Problem(display_path(kata_dir), 0, "meta.yaml is missing"))
        return None
    data, problems = load_yaml_file(meta_path, shown)
    if problems:
        plan.problems.extend(problems)
        return None
    if not isinstance(data, dict):
        plan.problems.append(Problem(shown, 0, "meta.yaml must be a mapping"))
        return None
    missing = [key for key in KATA_KEYS if key not in data]
    for key in missing:
        plan.problems.append(Problem(shown, 0, f"missing key '{key}'"))
    texts: dict[str, str] = {}
    for name in KATA_FILES:
        path = kata_dir / name
        try:
            texts[name] = path.read_text(encoding="utf-8")
        except OSError as exc:
            plan.problems.append(Problem(display_path(path), 0, f"cannot read: {exc.strerror}"))
    if missing or len(texts) < len(KATA_FILES):
        return None
    return {
        **{key: data[key] for key in KATA_KEYS},
        "starter": texts["starter.py"],
        "solution": texts["solution.py"],
        "tests": texts["test_kata.py"],
    }


def build_plan(root: Path) -> Plan:
    """Compile every output in memory. Writes nothing."""
    plan = Plan()
    course_path = root / "course.json"
    course = _read_json(course_path, display_path(course_path), plan)
    if course is None:
        plan.skipped.add("site/data/course.json")
        plan.skipped.add("README.md")
    else:
        plan.outputs.append(Output("site/data/course.json", dump_json(course)))
    facts = _facts(root, plan)
    if facts is None:
        plan.skipped.add("site/data/facts.json")
    else:
        plan.outputs.append(Output("site/data/facts.json", dump_json(facts)))
    terms = _terms(root, plan)
    if terms is None:
        plan.skipped.add("site/data/terms.json")
    else:
        plan.outputs.append(Output("site/data/terms.json", dump_json(terms)))
    if (root / "content").is_dir():
        for folder in sorted(p for p in (root / "content").glob("*") if p.is_dir()):
            for kind in CONTENT_KINDS:
                path = folder / f"{kind}.yaml"
                if not path.is_file():
                    continue
                rel = f"site/data/{kind}/{folder.name}.json"
                entries = _yaml_entries(path, plan)
                if entries is None:
                    plan.skipped.add(rel)
                else:
                    plan.outputs.append(Output(rel, dump_json(entries)))
    _katas(root, plan)
    _steps(root, plan)
    _scenarios(root, plan)
    readme = _readme(root, course, plan)
    if readme is not None:
        plan.outputs.append(Output("README.md", readme))
    else:
        plan.skipped.add("README.md")
    return plan


def write_plan(root: Path, plan: Plan) -> int:
    for output in plan.outputs:
        target = root / output.rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output.text, encoding="utf-8")
    return len(plan.outputs)


def check_plan(root: Path, plan: Plan) -> list[Problem]:
    """Compare outputs with the files on disk and list unexpected files under site/data/."""
    problems: list[Problem] = []
    expected = {o.rel for o in plan.outputs}
    for output in plan.outputs:
        target = root / output.rel
        shown = display_path(target)
        if not target.is_file():
            problems.append(Problem(shown, 0, "missing; run python tools/gen_data.py"))
        elif target.read_text(encoding="utf-8") != output.text:
            problems.append(Problem(shown, 0, "stale; run python tools/gen_data.py"))
    data_dir = root / "site" / "data"
    if data_dir.is_dir():
        for found in sorted(p for p in data_dir.rglob("*") if p.is_file()):
            rel = found.relative_to(root).as_posix()
            if rel not in expected and rel not in plan.skipped:
                problems.append(Problem(display_path(found), 0,
                                        "not produced by tools/gen_data.py (remove it or fix its "
                                        "source)"))
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compile site/data and the README counts.")
    parser.add_argument("--check", action="store_true", help="write nothing; report stale files")
    parser.add_argument("--root", type=Path, default=REPO, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    root: Path = args.root
    plan = build_plan(root)
    if args.check:
        problems = plan.problems + check_plan(root, plan)
        for problem in problems:
            print(problem)
        if problems:
            print(f"gen_data: FAILED ({len(problems)} problems)")
            return 1
        print(f"gen_data: {len(plan.outputs)} files up to date")
        return 0
    written = write_plan(root, plan)
    for problem in plan.problems:
        print(problem)
    if plan.problems:
        print(f"gen_data: FAILED ({len(plan.problems)} problems); wrote {written} files")
        return 1
    print(f"gen_data: wrote {written} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
