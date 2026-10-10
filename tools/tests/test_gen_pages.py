"""Tests for tools/gen_pages.py, run against a temporary copy of the site inputs."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import pytest

from tools.gen_pages import main

REPO = Path(__file__).resolve().parents[2]
INPUTS = (
    "site/data/course.json",
    "site/data/facts.json",
    "site/assets/core/glyphs.svg",
    "site/assets/core/tokens.css",
    "site/index.html",
    "site/design.html",
)


def copy_root(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    for rel in INPUTS:
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / rel, dest)
    return root


def region(text: str, name: str) -> str:
    match = re.search(rf"<!-- gen:{name} -->(.*?)<!-- /gen:{name} -->", text, re.S)
    assert match, f"no region {name}"
    return match.group(1)


def rename_module(root: Path, module_id: str, title: str) -> None:
    path = root / "site/data/course.json"
    course: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    for mod in course["modules"]:
        if mod["id"] == module_id:
            mod["title"] = title
    path.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")


def test_committed_pages_are_current() -> None:
    assert main(["--check", "--root", str(REPO)]) == 0


def test_a_module_title_change_makes_the_pages_stale(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    assert main(["--check", "--root", str(root)]) == 0
    rename_module(root, "A1", "A renamed module")
    assert main(["--check", "--root", str(root)]) == 1
    assert "stale" in capsys.readouterr().err
    assert "A renamed module" not in (root / "site/index.html").read_text(encoding="utf-8")


def test_writing_then_checking_is_clean(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    rename_module(root, "A1", "A renamed module")
    assert main(["--root", str(root)]) == 0
    assert "A renamed module" in (root / "site/index.html").read_text(encoding="utf-8")
    assert main(["--check", "--root", str(root)]) == 0


def test_an_unbuilt_module_is_text_and_its_key_is_disabled(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    text = (root / "site/index.html").read_text(encoding="utf-8")
    assert 'data-continue-link aria-disabled="true"' in text
    assert "opens soon" in region(text, "continue")
    assert 'href="modules/' not in region(text, "course-map")
    assert 'href="modules/' not in region(text, "continue")
    assert 'data-built="false"' in region(text, "course-map")


def test_a_built_module_becomes_a_link(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    (root / "site/modules").mkdir(parents=True)
    (root / "site/modules/same-model-different-harness.html").write_text(
        "<!doctype html>", encoding="utf-8"
    )
    assert main(["--root", str(root)]) == 0
    text = (root / "site/index.html").read_text(encoding="utf-8")
    assert 'data-continue-link href="modules/same-model-different-harness.html"' in text
    assert 'data-built="true"' in region(text, "course-map")


def test_a_missing_marker_is_an_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    page = root / "site/index.html"
    page.write_text(
        page.read_text(encoding="utf-8").replace("<!-- /gen:legend -->", ""), encoding="utf-8"
    )
    assert main(["--check", "--root", str(root)]) == 2
    assert "legend" in capsys.readouterr().err


def test_an_unknown_region_is_an_error(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    page = root / "site/design.html"
    page.write_text(
        page.read_text(encoding="utf-8") + "\n<!-- gen:nope -->\n\n<!-- /gen:nope -->\n",
        encoding="utf-8",
    )
    assert main(["--check", "--root", str(root)]) == 2


def test_the_course_map_lists_every_module_once() -> None:
    course: dict[str, Any] = json.loads(
        (REPO / "site/data/course.json").read_text(encoding="utf-8")
    )
    text = (REPO / "site/index.html").read_text(encoding="utf-8")
    rows = re.findall(r'data-module-id="([A-Z0-9]+)"', region(text, "course-map"))
    assert sorted(rows) == sorted(mod["id"] for mod in course["modules"])
    assert len(rows) == len(set(rows))


def test_the_clock_data_island_is_valid_and_complete() -> None:
    text = (REPO / "site/index.html").read_text(encoding="utf-8")
    body = region(text, "clock-data")
    match = re.search(
        r'<script type="application/json" id="clock-data">\n(.*)\n</script>', body, re.S
    )
    assert match, "no clock-data island"
    data: dict[str, Any] = json.loads(match.group(1))
    assert len(data["wires"]) == 8
    assert set(data["comesIn"]) == {wire["id"] for wire in data["wires"]}
    assert set(data["plugged"]) == {"context", "loop"}
    for wire in data["wires"]:
        assert wire["glyph"] in data["glyphs"]
        assert data["glyphs"][wire["glyph"]], f"glyph {wire['glyph']} has no path data"


def test_the_footer_date_is_the_oldest_verified_fact() -> None:
    facts: dict[str, Any] = json.loads((REPO / "site/data/facts.json").read_text(encoding="utf-8"))
    oldest = min(str(fact["verified_on"]) for fact in facts.values() if fact.get("verified_on"))
    for page in ("index.html", "design.html"):
        text = (REPO / "site" / page).read_text(encoding="utf-8")
        assert f'data-facts-oldest-iso="{oldest}"' in text
