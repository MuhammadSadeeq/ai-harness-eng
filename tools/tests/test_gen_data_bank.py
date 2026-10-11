"""gen_data builds the question bank (BP-5.4 §1): site/data/say/bank.json.

Every built module's say prompts are tagged with the module's wire. The prompts of
content/I5/say.yaml are tagged with their own wire (design, debugging or behavioral); a
prompt without one is a problem and is left out.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.gen_data import build_plan

PROMPT = "id: {id}\nobjectives: [{obj}]\nprompt: p\nmodel_answer: m\nrubric: [a, b, c, d]\n"


def _entry(prompt_id: str, obj: str, extra: str = "") -> str:
    body = PROMPT.format(id=prompt_id, obj=obj).replace("\n", "\n  ").rstrip()
    return "- " + body + ("\n  " + extra if extra else "") + "\n"


def _repo(tmp_path: Path) -> Path:
    course = {
        "modules": [
            {"id": "A1", "slug": "built-one", "tag": {"wire": "loop"}},
            {"id": "A2", "slug": "not-built", "tag": {"wire": "tools"}},
            {"id": "A3", "slug": "no-tag", "wires": ["verify", "observe"]},
        ]
    }
    (tmp_path / "course.json").write_text(json.dumps(course), encoding="utf-8")
    (tmp_path / "site" / "modules").mkdir(parents=True)
    for slug in ("built-one", "no-tag"):
        (tmp_path / "site" / "modules" / f"{slug}.html").write_text("<p>page</p>", encoding="utf-8")
    for mid in ("A1", "A2", "A3"):
        (tmp_path / "content" / mid).mkdir(parents=True)
        entry = _entry(f"{mid}-s1", "A1.o1")
        (tmp_path / "content" / mid / "say.yaml").write_text(entry, encoding="utf-8")
    (tmp_path / "content" / "I5").mkdir(parents=True)
    i5 = _entry("I5-s1", "I5.o3", "wire: design") + _entry("I5-s2", "I5.o4", "wire: nonsense")
    (tmp_path / "content" / "I5" / "say.yaml").write_text(i5, encoding="utf-8")
    return tmp_path


def _bank(root: Path) -> list[dict[str, Any]]:
    plan = build_plan(root)
    out = {o.rel: o.text for o in plan.outputs}
    bank: list[dict[str, Any]] = json.loads(out["site/data/say/bank.json"])
    return bank


def test_a_built_module_prompt_keeps_its_id_and_takes_the_module_wire(tmp_path: Path) -> None:
    entry = next(x for x in _bank(_repo(tmp_path)) if x["id"] == "A1-s1")
    assert entry["module"] == "A1" and entry["wire"] == "loop"


def test_a_module_without_a_page_is_not_in_the_bank(tmp_path: Path) -> None:
    assert not [x for x in _bank(_repo(tmp_path)) if x["module"] == "A2"]


def test_a_module_without_a_tag_takes_its_first_wire(tmp_path: Path) -> None:
    entry = next(x for x in _bank(_repo(tmp_path)) if x["id"] == "A3-s1")
    assert entry["wire"] == "verify"


def test_an_i5_prompt_keeps_its_own_kind_and_a_bad_one_is_a_problem(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    plan = build_plan(root)
    out = {o.rel: o.text for o in plan.outputs}
    bank: list[dict[str, Any]] = json.loads(out["site/data/say/bank.json"])
    kinds = {x["id"]: x["wire"] for x in bank if x["module"] == "I5"}
    assert kinds == {"I5-s1": "design"}
    messages = [p.message for p in plan.problems]
    assert any("I5-s2" in m and "design, debugging or behavioral" in m for m in messages)


def test_an_i5_page_does_not_double_its_prompts(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    (root / "site" / "modules" / "interview-room.html").write_text("<p>page</p>", encoding="utf-8")
    course = json.loads((root / "course.json").read_text(encoding="utf-8"))
    course["modules"].append({"id": "I5", "slug": "interview-room", "wires": ["control"]})
    (root / "course.json").write_text(json.dumps(course), encoding="utf-8")
    ids = [x["id"] for x in _bank(root) if x["module"] == "I5"]
    assert ids == ["I5-s1"]
    entry = next(x for x in _bank(root) if x["id"] == "I5-s1")
    assert entry["wire"] == "design"
