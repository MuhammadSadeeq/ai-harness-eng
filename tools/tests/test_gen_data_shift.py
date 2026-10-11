"""gen_data builds the on-call shift data (BP-5.4 §4).

site/data/cards/board.json holds the cards of every built module and of I5, each tagged with
its module. site/data/oncall/shift.json holds the incidents a shift can pick (the hx-incident
tapes that a built module page uses, when the scenario file carries an incident block) and the
memory katas of built modules.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.gen_data import build_plan


def _outputs(root: Path) -> dict[str, str]:
    plan = build_plan(root)
    return {o.rel: o.text for o in plan.outputs}


def _repo(tmp_path: Path) -> Path:
    course = {
        "modules": [
            {"id": "A1", "slug": "built-one", "title": "Built one"},
            {"id": "A2", "slug": "not-built", "title": "Not built"},
        ]
    }
    (tmp_path / "course.json").write_text(json.dumps(course), encoding="utf-8")
    (tmp_path / "site" / "modules").mkdir(parents=True)
    page = (
        '<hx-incident tape="a1-good"></hx-incident>\n'
        '<hx-incident tape="a1-plain"></hx-incident>\n'
        '<hx-incident tape="a1-good"></hx-incident>\n'
    )
    (tmp_path / "site" / "modules" / "built-one.html").write_text(page, encoding="utf-8")
    scenarios = tmp_path / "scenarios"
    scenarios.mkdir()
    incident = {"incident": {"family": "false-done"}}
    (scenarios / "a1-good.json").write_text(json.dumps(incident), encoding="utf-8")
    (scenarios / "a1-plain.json").write_text(json.dumps({"steps": []}), encoding="utf-8")
    (scenarios / "a2-hidden.json").write_text(json.dumps(incident), encoding="utf-8")
    for kata, module, from_memory in (
        ("A1-memo", "A1", True),
        ("A1-practice", "A1", False),
        ("A2-memo", "A2", True),
    ):
        folder = tmp_path / "katas" / kata
        folder.mkdir(parents=True)
        flag = str(from_memory).lower()
        meta = f"id: {kata}\nmodule: {module}\ntitle: T {kata}\nfrom_memory: {flag}\n"
        (folder / "meta.yaml").write_text(meta, encoding="utf-8")
    (tmp_path / "content" / "A1").mkdir(parents=True)
    (tmp_path / "content" / "A1" / "cards.yaml").write_text(
        "- id: A1-c1\n  type: term\n  front: f\n  back: b\n", encoding="utf-8"
    )
    (tmp_path / "content" / "A1" / "say.yaml").write_text("- id: A1-s1\n", encoding="utf-8")
    (tmp_path / "content" / "A2").mkdir(parents=True)
    (tmp_path / "content" / "A2" / "cards.yaml").write_text(
        "- id: A2-c1\n  type: term\n  front: f\n  back: b\n", encoding="utf-8"
    )
    (tmp_path / "content" / "I5").mkdir(parents=True)
    (tmp_path / "content" / "I5" / "cards.yaml").write_text(
        "- id: I5-c1\n  type: term\n  front: f\n  back: b\n", encoding="utf-8"
    )
    return tmp_path


def _shift(root: Path) -> dict[str, Any]:
    shift: dict[str, Any] = json.loads(_outputs(root)["site/data/oncall/shift.json"])
    return shift


def _board(root: Path) -> list[dict[str, Any]]:
    board: list[dict[str, Any]] = json.loads(_outputs(root)["site/data/cards/board.json"])
    return board


def test_the_board_holds_built_module_cards_and_i5_each_with_its_module(tmp_path: Path) -> None:
    board = _board(_repo(tmp_path))
    assert {(x["id"], x["module"]) for x in board} == {("A1-c1", "A1"), ("I5-c1", "I5")}


def test_the_board_card_keeps_its_own_fields(tmp_path: Path) -> None:
    card = next(x for x in _board(_repo(tmp_path)) if x["id"] == "A1-c1")
    assert card["type"] == "term" and card["front"] == "f" and card["back"] == "b"


def test_incidents_come_from_built_pages_once_each_and_need_an_incident_block(
    tmp_path: Path,
) -> None:
    incidents = _shift(_repo(tmp_path))["incidents"]
    assert incidents == [
        {"module": "A1", "tape": "a1-good", "family": "false-done", "title": "Built one"}
    ]


def test_a_module_without_a_page_offers_no_incident(tmp_path: Path) -> None:
    assert not [x for x in _shift(_repo(tmp_path))["incidents"] if x["module"] == "A2"]


def test_say_modules_are_the_built_modules_that_have_prompts(tmp_path: Path) -> None:
    shift = _shift(_repo(tmp_path))
    assert shift["say_modules"] == ["A1"]


def test_memory_katas_are_only_the_built_modules_with_from_memory(tmp_path: Path) -> None:
    katas = _shift(_repo(tmp_path))["memory_katas"]
    assert [(x["id"], x["module"], x["title"]) for x in katas] == [
        ("A1-memo", "A1", "T A1-memo")
    ]


def test_i5_cards_are_on_the_board_once_even_with_its_page(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    (root / "site" / "modules" / "interview-room.html").write_text("<p>page</p>", encoding="utf-8")
    course = json.loads((root / "course.json").read_text(encoding="utf-8"))
    course["modules"].append({"id": "I5", "slug": "interview-room", "title": "Interview Room"})
    (root / "course.json").write_text(json.dumps(course), encoding="utf-8")
    ids = [x["id"] for x in _board(root)]
    assert ids.count("I5-c1") == 1
