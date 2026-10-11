"""Tests for tools/gen_pages.py, run against a temporary copy of the site inputs."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import pytest

from tools import gen_pages
from tools.gen_pages import main

REPO = Path(__file__).resolve().parents[2]
INPUTS = (
    "site/data/course.json",
    "site/data/facts.json",
    "site/assets/core/glyphs.svg",
    "site/assets/core/tokens.css",
    "site/index.html",
    "site/design.html",
    "site/glossary.html",
    "site/readiness.html",
)


def copy_root(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    for rel in INPUTS:
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / rel, dest)
    return root


def region(text: str, name: str) -> str:
    match = re.search(rf"<!-- gen:{name} -->(.*?)<!-- /gen(?::{name})? -->", text, re.S)
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
        MODULE_PAGE, encoding="utf-8"
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


def test_comes_in_is_the_first_tagged_module_on_the_path() -> None:
    """D-043: the expected comes-in module of each of the eight wires, derived from the tags."""
    course: dict[str, Any] = json.loads(
        (REPO / "site/data/course.json").read_text(encoding="utf-8")
    )
    expected = {
        "control": "C1",
        "context": "A3",
        "loop": "A4",
        "errors": "C6",
        "tools": "A5",
        "permissions": "C9",
        "verify": "C11",
        "observe": "C12",
    }
    assert gen_pages.comes_in(gen_pages.Data(course, {}, {}, frozenset(), frozenset())) == expected


def test_the_home_board_is_hx_clock_with_an_empty_fallback() -> None:
    text = (REPO / "site/index.html").read_text(encoding="utf-8")
    assert '<hx-clock board="learner">' in text
    assert "clock-data" not in text
    assert "Your board is empty." in region(text, "caption")
    assert "comes in C1" in region(text, "legend")
    assert "comes in A3" in region(text, "legend")


def test_the_footer_date_is_the_oldest_verified_fact() -> None:
    facts: dict[str, Any] = json.loads((REPO / "site/data/facts.json").read_text(encoding="utf-8"))
    oldest = min(str(fact["verified_on"]) for fact in facts.values() if fact.get("verified_on"))
    for page in ("index.html", "design.html"):
        text = (REPO / "site" / page).read_text(encoding="utf-8")
        assert f'data-facts-oldest-iso="{oldest}"' in text


MODULE_PAGE = (
    '<!doctype html>\n<html lang="en" data-module="B2">\n<body>\n<main id="main" class="module">\n'
    '  <header class="module-head">\n    <!-- gen:module-meta --><!-- /gen -->\n  </header>\n'
    '  <aside class="rail">\n    <!-- gen:course-map -->\n    <!-- /gen -->\n  </aside>\n'
    "</main>\n</body>\n</html>\n"
)


def _module_root(tmp_path: Path, text: str = MODULE_PAGE, slug: str = "the-agent-loop") -> Path:
    root = copy_root(tmp_path)
    (root / "site" / "modules").mkdir(parents=True)
    (root / "site" / "modules" / f"{slug}.html").write_text(text, encoding="utf-8")
    return root


def test_a_module_page_gets_its_header_objectives_and_beat_strip(tmp_path: Path) -> None:
    root = _module_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    text = (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8")
    course = json.loads((REPO / "site/data/course.json").read_text(encoding="utf-8"))
    b2 = next(m for m in course["modules"] if m["id"] == "B2")
    header = region(text, "module-meta")
    assert f'data-objectives-total="{len(b2["objectives"])}"' in header
    assert f"0 of {len(b2['objectives'])} objectives done" in header
    for objective in b2["objectives"]:
        assert f'data-objective="{objective["id"]}"' in header
    for beat in course["kinds"]["core"]["beats"]:
        assert f'href="#{beat}"' in header
    assert main(["--check", "--root", str(root)]) == 0


def test_an_unbuilt_prerequisite_is_text_with_soon_and_a_built_one_is_a_link(
    tmp_path: Path,
) -> None:
    root = _module_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    text = (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8")
    assert 'class="soon"' in region(text, "module-meta")
    assert 'href="tools-give-the-model-hands.html"' not in region(text, "module-meta")
    (root / "site" / "modules" / "tools-give-the-model-hands.html").write_text(
        MODULE_PAGE, encoding="utf-8"
    )
    assert main(["--root", str(root)]) == 0
    text = (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8")
    assert 'href="tools-give-the-model-hands.html"' in region(text, "module-meta")


def test_the_module_course_map_links_locally_and_marks_the_current_module(tmp_path: Path) -> None:
    root = _module_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    text = (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8")
    course_map = region(text, "course-map")
    assert 'href="the-agent-loop.html" aria-current="page"' in course_map
    assert 'href="modules/' not in course_map


def test_a_module_page_without_its_regions_is_an_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    text = MODULE_PAGE.replace("<!-- gen:course-map -->\n    <!-- /gen -->\n", "")
    root = _module_root(tmp_path, text=text)
    assert main(["--root", str(root)]) == 2
    assert "course-map" in capsys.readouterr().err


def test_a_module_page_for_no_course_module_is_an_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = _module_root(tmp_path, slug="no-such-module")
    assert main(["--root", str(root)]) == 2
    assert "no-such-module" in capsys.readouterr().err


TOP_PAGES = ("index.html", "design.html", "glossary.html", "readiness.html")


def test_the_chrome_is_added_once_and_a_second_run_changes_nothing(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    first = {page: (root / "site" / page).read_text(encoding="utf-8") for page in TOP_PAGES}
    assert main(["--root", str(root)]) == 0
    for page in TOP_PAGES:
        assert (root / "site" / page).read_text(encoding="utf-8") == first[page], page
    assert main(["--check", "--root", str(root)]) == 0


def test_a_hand_written_top_bar_and_footer_are_replaced_by_their_regions(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    text = (root / "site" / "index.html").read_text(encoding="utf-8")
    assert text.count('class="topbar"') == 1
    assert text.count('class="menu-sheet"') == 1
    assert text.count("<footer") == 1
    assert "gen:facts" not in text, "the footer region carries the facts line now"
    assert text.count("data-facts-line") == 1
    assert 'href="glossary.html"' in region(text, "topbar")
    assert 'href="readiness.html"' in region(text, "topbar")


def test_chrome_markers_go_after_the_skip_link_on_a_page_without_a_top_bar(tmp_path: Path) -> None:
    skip = '<a class="skip" href="#main">Skip to content</a>\n'
    text = MODULE_PAGE.replace("<body>\n", "<body>\n" + skip, 1)
    root = _module_root(tmp_path, text=text)
    assert main(["--root", str(root)]) == 0
    page = (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8")
    assert page.index('class="skip"') < page.index("<!-- gen:topbar -->") < page.index("<main")
    assert page.index("<!-- gen:footer -->") < page.index("</body>")


def test_the_module_top_bar_names_its_module_and_the_top_pages_do_not(tmp_path: Path) -> None:
    root = _module_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    module_bar = region(
        (root / "site" / "modules" / "the-agent-loop.html").read_text(encoding="utf-8"), "topbar"
    )
    assert '<span class="mod-code">B2</span>' in module_bar
    assert 'href="../index.html"' in module_bar
    assert 'href="../glossary.html"' in module_bar
    index_bar = region((root / "site" / "index.html").read_text(encoding="utf-8"), "topbar")
    assert "module-id" not in index_bar
    assert 'aria-current="page">Course' in index_bar


def test_check_reports_a_top_page_whose_chrome_markers_are_missing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    assert main(["--root", str(root)]) == 0
    path = root / "site" / "glossary.html"
    current = path.read_text(encoding="utf-8")
    text = re.sub(r"<!-- gen:topbar -->.*?<!-- /gen:topbar -->\n", "", current, flags=re.S)
    path.write_text(text, encoding="utf-8")
    assert main(["--check", "--root", str(root)]) == 1
    assert "stale: site/glossary.html" in capsys.readouterr().err


def test_the_glossary_region_is_left_to_its_own_generator(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    before = region((root / "site" / "glossary.html").read_text(encoding="utf-8"), "glossary")
    assert main(["--root", str(root)]) == 0
    after = region((root / "site" / "glossary.html").read_text(encoding="utf-8"), "glossary")
    assert after == before
