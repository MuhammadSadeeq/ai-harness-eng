"""Tests for tools/lib/course.py, run against the fixture course (tools/tests/fixtures)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from tools.lib.course import (
    REPO,
    ancestors,
    compute_counts,
    kind_spec,
    load_course,
    term_owner,
    term_owners,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "content" / "course.json"


def fixture_course() -> dict[str, Any]:
    return load_course(FIXTURE)


def test_load_course_reads_the_fixture() -> None:
    course = fixture_course()
    assert course["schema"] == 1
    assert [m["id"] for m in course["modules"]] == ["S0", "A1", "T1"]


def test_load_course_rejects_a_non_object(tmp_path: Path) -> None:
    path = tmp_path / "course.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError):
        load_course(path)


def test_repo_root_holds_the_course_file() -> None:
    assert (REPO / "course.json").is_file()


def test_ancestors_follow_prerequisites_only() -> None:
    course = fixture_course()
    assert ancestors(course, "S0") == set()
    assert ancestors(course, "A1") == {"S0"}
    assert ancestors(course, "T1") == {"S0"}


def test_ancestors_are_transitive_and_never_include_primers() -> None:
    course = fixture_course()
    course["modules"][1]["primers"] = ["T1"]
    course["modules"].append({**course["modules"][1], "id": "B1", "prereqs": ["A1"]})
    assert ancestors(course, "B1") == {"A1", "S0"}
    assert "T1" not in ancestors(course, "A1")


def test_ancestors_rejects_an_unknown_module() -> None:
    with pytest.raises(KeyError):
        ancestors(fixture_course(), "Z9")


def test_compute_counts_matches_the_fixture_counts() -> None:
    course = fixture_course()
    assert compute_counts(course) == course["counts"]


def test_compute_counts_counts_terms_case_insensitively() -> None:
    course = fixture_course()
    course["modules"][2]["terms"].append("AGENT")
    assert compute_counts(course)["terms_planned"] == 8
    course["modules"][2]["terms"].append("Gizmo")
    assert compute_counts(course)["terms_planned"] == 9


def test_compute_counts_minutes_path_follows_the_path_only() -> None:
    course = fixture_course()
    assert compute_counts(course)["minutes_path"] == 65
    assert compute_counts(course)["minutes_all"] == 85
    course["path"] = ["S0"]
    assert compute_counts(course)["minutes_path"] == 25


def test_compute_counts_lists_every_kind_in_kinds_order() -> None:
    course = fixture_course()
    by_kind = compute_counts(course)["modules_by_kind"]
    assert list(by_kind) == list(course["kinds"])
    assert by_kind["build"] == 0
    assert by_kind["primer"] == 1


def test_kind_spec_returns_beats_and_requires() -> None:
    spec = kind_spec(fixture_course(), "core")
    assert spec["beats"] == ["break", "see", "fix", "prove", "keep"]
    assert "incident" in spec["requires"]
    with pytest.raises(KeyError):
        kind_spec(fixture_course(), "nope")


def test_term_owners_keeps_duplicates_and_term_owner_takes_the_first() -> None:
    course = fixture_course()
    assert term_owners(course)["agent"] == ["S0"]
    assert term_owner(course)["dataclass"] == "A1"
    course["modules"][2]["terms"].append("agent")
    assert term_owners(course)["agent"] == ["S0", "T1"]
    assert term_owner(course)["agent"] == "S0"
