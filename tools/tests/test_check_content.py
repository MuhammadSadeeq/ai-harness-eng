"""Tests for tools/check_content.py: the fixture course, good and bad pages, and mutations."""

from __future__ import annotations

import importlib
import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from tools.check_content import TYPED_COUNT, Report, RunResult, check_course, main, run_checks

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "content"
GOOD_PAGES = sorted((FIXTURES / "site" / "modules").glob("*.html"))
BAD_CASES: list[tuple[str, str, str]] = [
    ("B1", "bad/B1/same-model-different-harness.html", "<title> must be"),
    ("B2", "bad/B2/the-agent-loop.html", "beats are"),
    ("B3", "bad/B3/the-agent-loop.html", "needs an hx-bench in prove"),
    ("B4", "bad/B4/the-agent-loop.html", "objective A1.o4 has no assessment item"),
    ("B4", "bad/B4-predict/same-model-different-harness.html", "a prediction proves no objective"),
    ("B5", "bad/B5/the-agent-loop.html", "the limit is 1,000"),
    ("B6", "bad/B6/the-agent-loop.html", "typed count '69 modules'"),
    ("B7", "bad/B7b/the-agent-loop.html", "is not a known term id"),
    ("B7", "bad/B7c/the-agent-loop.html", "belongs in S0, not A1"),
    ("B7", "bad/B7d/the-agent-loop.html", 'no <dfn data-term="stop-reason">'),
    ("B7", "bad/B7e/the-agent-loop.html", "term 'type hint' is taught in T1"),
    ("B7", "bad/B7f/same-model-different-harness.html", "at most two are allowed"),
    ("B8", "bad/B8/same-model-different-harness.html", "inline style attributes"),
    (
        "B8",
        "bad/B8-handler/same-model-different-harness.html",
        "inline event-handler attribute 'onclick'",
    ),
    (
        "B8",
        "bad/B8-javascript/same-model-different-harness.html",
        "javascript: URLs are not allowed in href",
    ),
    ("B8", "bad/B8-pre/same-model-different-harness.html", 'a <pre> needs tabindex="0"'),
]


def copy_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    shutil.copytree(FIXTURES, root)
    return root


def run_on(root: Path, pages: list[Path] | None = None) -> tuple[Report, RunResult]:
    report = Report()
    result = run_checks(
        course_path=root / "course.json",
        site=root / "site",
        content=root / "content",
        pages=[str(p) for p in pages] if pages is not None else (),
        curriculum=None,
        report=report,
    )
    return report, result


def write_curriculum(root: Path, course: dict[str, Any] | None = None) -> Path:
    """A docs/CURRICULUM.md whose generated block is current for the given course."""
    render = importlib.import_module("tools.render_curriculum")
    data = course if course is not None else json.loads((root / "course.json").read_text())
    path = root / "docs" / "CURRICULUM.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"# Curriculum\n\nText above.\n\n{render.BEGIN}\n{render.render(data)}\n{render.END}\n\n"
        "Text below.\n",
        encoding="utf-8",
    )
    return path


def mutate_course(tmp_path: Path, change: Any) -> Report:
    course = json.loads((FIXTURES / "course.json").read_text(encoding="utf-8"))
    change(course)
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "course.json"
    path.write_text(json.dumps(course, indent=2, ensure_ascii=False), encoding="utf-8")
    report = Report()
    check_course(path, report, curriculum=None)
    return report


def test_good_pages_pass_with_no_problems() -> None:
    report, result = run_on(FIXTURES)
    assert report.problems == []
    assert result == RunResult(course_checked=True, pages_checked=3, modules=3)
    assert len(GOOD_PAGES) == 3


def test_typed_count_flags_two_or_more_and_not_one() -> None:
    for text in ["2 labs", "two labs", "12 modules", "69 modules", "ten cards", "42 katas"]:
        assert TYPED_COUNT.search(text), text
    for text in ["one lab per module", "one module", "1 module", "0 terms", "failure families"]:
        assert TYPED_COUNT.search(text) is None, text


def test_good_course_passes_all_course_checks() -> None:
    report = Report()
    course = check_course(FIXTURES / "course.json", report, curriculum=None)
    assert course is not None
    assert report.problems == []


@pytest.mark.parametrize(("rule", "page", "expected"), BAD_CASES)
def test_each_bad_page_fails_only_its_own_rule(rule: str, page: str, expected: str) -> None:
    report, _ = run_on(FIXTURES, [FIXTURES / page])
    assert report.problems, f"{page} should fail"
    assert all(p.message.startswith(f"[{rule}]") for p in report.problems), [
        str(p) for p in report.problems
    ]
    assert any(expected in p.message for p in report.problems), [str(p) for p in report.problems]


def test_page_name_must_be_a_module_slug(tmp_path: Path) -> None:
    page = tmp_path / "not-a-module.html"
    page.write_text((GOOD_PAGES[0]).read_text(encoding="utf-8"), encoding="utf-8")
    report, _ = run_on(FIXTURES, [page])
    assert any("is not a module slug" in p.message for p in report.problems)


def test_prose_between_900_and_1000_warns_without_failing(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    page = root / "site" / "modules" / "the-agent-loop.html"
    words = [
        "garden",
        "river",
        "window",
        "kettle",
        "lantern",
        "meadow",
        "orchard",
        "pebble",
        "quilt",
        "ribbon",
    ]
    filler = " ".join(words[i % len(words)] for i in range(850))
    text = page.read_text(encoding="utf-8").replace(
        "<p>The loop calls the model",
        f"<p>{filler}</p>\n    <p>The loop calls the model",
    )
    page.write_text(text, encoding="utf-8")
    report, _ = run_on(root, [page])
    assert report.problems == []
    assert any("warning: [B5] prose is" in line for line in report.lines)


def test_course_mutations_fail_with_the_expected_rule(tmp_path: Path) -> None:
    def case(name: str, change: Any, expected: str) -> None:
        report = mutate_course(tmp_path / name, change)
        assert any(expected in p.message for p in report.problems), [
            str(p) for p in report.problems
        ]

    def set_(path: list[Any], value: Any) -> Any:
        def change(course: dict[str, Any]) -> None:
            target: Any = course
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value

        return change

    def pop(key: str) -> Any:
        def change(course: dict[str, Any]) -> None:
            course.pop(key)

        return change

    (tmp_path / "invalid").mkdir()
    (tmp_path / "invalid" / "course.json").write_text("{", encoding="utf-8")
    report = Report()
    assert check_course(tmp_path / "invalid" / "course.json", report, None) is None
    assert any("[A1] invalid JSON" in p.message for p in report.problems)

    for name, change, expected in [
        ("schema", pop("counts"), "[A1] schema"),
        ("unknown-wire", set_(["modules", 1, "wires"], ["nope"]), "unknown wire 'nope'"),
        ("objective-id", set_(["modules", 1, "objectives", 0, "id"], "A1.o9"), "expected 'A1.o1'"),
        (
            "primer-objectives",
            set_(
                ["modules", 2, "objectives"], [{"id": f"T1.o{i}", "text": "x"} for i in range(1, 5)]
            ),
            "a primer has 4 objectives, needs 3",
        ),
        ("cycle", set_(["modules", 0, "prereqs"], ["A1"]), "prerequisite cycle"),
        ("path-missing", set_(["path"], ["S0"]), "A1 is missing from path"),
        ("path-order", set_(["path"], ["A1", "S0"]), "comes before its prerequisite S0"),
        ("primer-in-path", set_(["path"], ["S0", "A1", "T1"]), "primer T1 must not be in path"),
        (
            "term-two-owners",
            lambda c: c["modules"][2]["terms"].append("agent"),
            "term 'agent' is listed by S0, T1",
        ),
        (
            "incident-without-family",
            set_(["modules", 1, "family"], None),
            "requires an incident, so it needs a failure family",
        ),
        (
            "family-module-missing",
            set_(["failure_families", 0, "module"], "Z9"),
            "module 'Z9' does not exist",
        ),
        (
            "counts-modules",
            set_(["counts", "modules"], 4),
            "counts.modules: file has 4, computed 3",
        ),
        (
            "counts-kind",
            set_(["counts", "modules_by_kind", "core"], 2),
            "counts.modules_by_kind.core: file has 2, computed 1",
        ),
    ]:
        case(name, change, expected)


def test_stale_and_current_curriculum_block(tmp_path: Path) -> None:
    course = json.loads((FIXTURES / "course.json").read_text(encoding="utf-8"))
    doc = write_curriculum(tmp_path / "current", course)
    report = Report()
    check_course(FIXTURES / "course.json", report, curriculum=doc)
    assert report.problems == []

    stale = tmp_path / "stale.md"
    stale.write_text(
        "x\n<!-- BEGIN GENERATED: tools/render_curriculum.py -->\nold\n<!-- END GENERATED -->\n",
        encoding="utf-8",
    )
    report = Report()
    check_course(FIXTURES / "course.json", report, curriculum=stale)
    assert any("[A7] generated block is stale" in p.message for p in report.problems)

    bare = tmp_path / "bare.md"
    bare.write_text("no markers here\n", encoding="utf-8")
    report = Report()
    check_course(FIXTURES / "course.json", report, curriculum=bare)
    assert any("[A7] generated block markers are missing" in p.message for p in report.problems)


def test_invalid_content_yaml_reports_its_line(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    (root / "content" / "S0" / "cards.yaml").write_text(
        "- id: S0-c1\n  front: [unclosed\n", encoding="utf-8"
    )
    report, _ = run_on(root)
    yaml_problems = [p for p in report.problems if "invalid YAML" in p.message]
    assert yaml_problems and yaml_problems[0].line > 0
    assert yaml_problems[0].path.endswith("cards.yaml")


def test_term_not_planned_for_its_module_is_rule_a(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    terms = root / "content" / "S0" / "terms.yaml"
    terms.write_text(
        terms.read_text(encoding="utf-8") + "- id: gizmo\n  term: gizmo\n"
        "  aliases: [gizmo]\n  strict: true\n  wire: loop\n  definition: x\n",
        encoding="utf-8",
    )
    report, _ = run_on(root)
    assert any("(a) term 'gizmo' is not planned for S0" in p.message for p in report.problems)


def test_duplicate_term_id_and_unknown_objective_in_content(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    terms = root / "content" / "S0" / "terms.yaml"
    terms.write_text(
        terms.read_text(encoding="utf-8") + "- id: agent\n  term: harness\n"
        "  aliases: [harness]\n  strict: true\n  wire: loop\n  definition: x\n",
        encoding="utf-8",
    )
    cards = root / "content" / "S0" / "cards.yaml"
    cards.write_text(cards.read_text(encoding="utf-8").replace("S0.o1", "Z9.o1"), encoding="utf-8")
    report, _ = run_on(root)
    assert any("term id 'agent' is used twice" in p.message for p in report.problems)
    assert any("[B4] unknown objective id 'Z9.o1'" in p.message for p in report.problems)


def test_page_only_run_skips_course_checks(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    report, result = run_on(root, [root / "site" / "modules" / "python-dataclasses.html"])
    assert report.problems == []
    assert result == RunResult(course_checked=False, pages_checked=1, modules=3)


def test_main_full_run_summary_and_failure_exit(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_fixture(tmp_path)
    write_curriculum(root)
    args = [
        "--course",
        str(root / "course.json"),
        "--site",
        str(root / "site"),
        "--content",
        str(root / "content"),
    ]
    assert main(args) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_content: course.json OK (3 modules), 3 pages OK"
    )

    assert main([*args, str(root / "site" / "modules" / "the-agent-loop.html")]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_content: course.json not checked, 1 pages OK"
    )

    bad = FIXTURES / "bad" / "B8" / "same-model-different-harness.html"
    assert main([*args, str(bad)]) == 1
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_content: FAILED (1 problems)"
    )


def _good_page_copy(tmp_path: Path) -> Path:
    root = copy_fixture(tmp_path)
    return root / "site" / "modules" / "the-agent-loop.html"


def test_a_disallowed_element_in_a_generated_region_fails_b9(tmp_path: Path) -> None:
    page = _good_page_copy(tmp_path)
    text = page.read_text(encoding="utf-8")
    table = "<table><tr><td>x</td></tr></table>"
    text = text.replace("<!-- gen:module-meta -->", "<!-- gen:module-meta -->" + table, 1)
    page.write_text(text, encoding="utf-8")
    report, _ = run_on(page.parents[2], [page])
    messages = [p.message for p in report.problems]
    assert "[B9] <table> is not allowed in gen:module-meta" in messages
    assert all(m.startswith("[B9]") for m in messages), messages


def test_generated_text_is_not_checked_as_prose_or_counts(tmp_path: Path) -> None:
    page = _good_page_copy(tmp_path)
    text = page.read_text(encoding="utf-8")
    text = text.replace(
        "<!-- gen:module-meta -->", "<!-- gen:module-meta --><p>2 of 69 modules shown</p>", 1
    )
    page.write_text(text, encoding="utf-8")
    report, _ = run_on(page.parents[2], [page])
    assert report.problems == [], [str(p) for p in report.problems]


def test_a_module_page_needs_both_generated_regions(tmp_path: Path) -> None:
    page = _good_page_copy(tmp_path)
    text = page.read_text(encoding="utf-8")
    text = text.replace("<!-- gen:course-map -->\n    <!-- /gen -->\n", "", 1)
    page.write_text(text, encoding="utf-8")
    report, _ = run_on(page.parents[2], [page])
    assert [p.message for p in report.problems] == [
        "[B9] the page needs a generated region gen:course-map"
    ]


def test_placement_yaml_is_a_mapping_and_is_not_read_as_a_list(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    owner = next(p for p in (root / "content").iterdir() if p.is_dir())
    (owner / "placement.yaml").write_text("questions: []\nrules: []\nstart: X1\n", encoding="utf-8")
    report, _ = run_on(root)
    assert report.problems == []


def test_the_generated_objectives_list_is_not_an_assessment_item(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    page = root / "site" / "modules" / "python-dataclasses.html"
    text = page.read_text(encoding="utf-8")
    text = text.replace(' data-objective="T1.o1"', "")
    listing = ('<ol class="objectives" data-objective-list>'
               '<li data-objective="T1.o1">Listed only.</li></ol>')
    text = text.replace("<main", listing + "<main", 1)
    page.write_text(text, encoding="utf-8")
    report, _ = run_on(root, [page])
    assert any("[B4] objective T1.o1 has no assessment item" in p.message for p in report.problems)


def _edit_page(root: Path, name: str, old: str, new: str) -> Path:
    page = root / "site" / "modules" / name
    text = page.read_text(encoding="utf-8")
    assert text.count(old) == 1, old[:60]
    page.write_text(text.replace(old, new), encoding="utf-8")
    return page


T1_PROSE = "<p>Does Python enforce a type hint at runtime?</p></hx-check>"
HX_CHECK_T1_1 = f'<hx-check mode="check" src="T1" item="T1-c1" data-objective="T1.o1">{T1_PROSE}'


def test_a_replay_credits_no_objective_so_its_objective_is_uncovered(tmp_path: Path) -> None:
    # D-061: hx-replay credits nothing. T1.o1 was credited by the hx-check; a replay is not.
    root = copy_fixture(tmp_path)
    new = (
        '<hx-replay tape="T1" data-objective="T1.o1">'
        "<p>Does Python enforce a type hint at runtime?</p></hx-replay>"
    )
    page = _edit_page(root, "python-dataclasses.html", HX_CHECK_T1_1, new)
    report, _ = run_on(root, [page])
    assert any("[B4] objective T1.o1 has no assessment item" in p.message for p in report.problems)


BAD_B4_PAGE = FIXTURES / "bad" / "B4" / "the-agent-loop.html"
MOUNT_SLOT = '<div data-station-slot data-mounts="hx-kata" data-objective="A1.o4"></div>'


def test_a_slot_that_mounts_a_kata_credits_the_objective_it_declares(tmp_path: Path) -> None:
    # D-061 (round 3): a slot marked data-mounts="hx-kata" credits its data-objective;
    # without the mark it does not.
    root = copy_fixture(tmp_path)
    page = tmp_path / "the-agent-loop.html"
    text = BAD_B4_PAGE.read_text(encoding="utf-8")
    assert text.count("</main>") == 1
    page.write_text(text.replace("</main>", MOUNT_SLOT + "</main>"), encoding="utf-8")
    report, _ = run_on(root, [page])
    assert not any("objective A1.o4 has no assessment item" in p.message for p in report.problems)
    plain = tmp_path / "plain" / "the-agent-loop.html"
    plain.parent.mkdir()
    unmarked = MOUNT_SLOT.replace(' data-mounts="hx-kata"', "")
    plain.write_text(text.replace("</main>", unmarked + "</main>"), encoding="utf-8")
    report, _ = run_on(root, [plain])
    assert any("[B4] objective A1.o4 has no assessment item" in p.message for p in report.problems)


def test_say_and_cards_objectives_count_only_while_their_component_is_rendered(
    tmp_path: Path,
) -> None:
    # D-061: an objective named in say.yaml is credited only where hx-say is rendered; cards.yaml
    # likewise for hx-cards.
    root = copy_fixture(tmp_path)
    say = '<hx-say src="A1"><p>Say the loop out loud.</p></hx-say>'
    page = _edit_page(root, "the-agent-loop.html", say, "<p>Say the loop out loud.</p>")
    report, _ = run_on(root, [page])
    assert any("[B4] objective A1.o3 has no assessment item" in p.message for p in report.problems)
    root = copy_fixture(tmp_path / "again")
    cards = '<hx-cards src="A1"><p>Cards for this module appear here.</p></hx-cards>'
    text = "<p>Cards for this module appear here.</p>"
    page = _edit_page(root, "the-agent-loop.html", cards, text)
    report, _ = run_on(root, [page])
    assert any("[B4] objective A1.o2 has no assessment item" in p.message for p in report.problems)


def test_a_strict_term_in_component_text_is_checked_but_not_inside_code(tmp_path: Path) -> None:
    # B7 scans the static text inside hx-* elements (what a reader sees with no JavaScript), not pre
    # or code. T1 requires S0 only, so a term of A1 (not a prerequisite of T1) is out of order.
    root = copy_fixture(tmp_path)
    taught = "<p>Does a stop reason say why the model stopped?</p></hx-check>"
    page = _edit_page(root, "python-dataclasses.html", T1_PROSE, taught)
    report, _ = run_on(root, [page])
    taught_in_a1 = "[B7] term 'stop_reason' is taught in A1"
    assert any(taught_in_a1 in p.message for p in report.problems)
    root = copy_fixture(tmp_path / "coded")
    coded = "<pre><code>stop reason</code></pre></hx-check>"
    page = _edit_page(root, "python-dataclasses.html", T1_PROSE, coded)
    report, _ = run_on(root, [page])
    assert not any("[B7] term 'stop_reason'" in p.message for p in report.problems)
