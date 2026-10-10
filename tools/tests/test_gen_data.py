"""Tests for tools/gen_data.py, run against a temporary copy of the fixture root."""

from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from tools.gen_data import dump_json, main

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "content"
README_BLOCK = (
    "- 3 modules in 3 parts, 10 objectives, 2 failure families, "
    "about 1 hours of lessons on the default path."
)


def copy_root(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    shutil.copytree(FIXTURES, root)
    return root


def run(root: Path, *args: str) -> int:
    return main(["--root", str(root), *args])


def test_dump_json_is_deterministic_and_turns_dates_into_strings() -> None:
    value = {"b": 1, "a": "é", "when": date(2026, 10, 10)}
    expected = json.dumps({"a": "é", "b": 1, "when": "2026-10-10"},
                          indent=1, ensure_ascii=False, sort_keys=True) + "\n"
    assert dump_json(value) == expected


def test_write_creates_every_output(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    assert run(root) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "gen_data: wrote 9 files"

    course = json.loads((root / "site" / "data" / "course.json").read_text(encoding="utf-8"))
    assert course == json.loads((root / "course.json").read_text(encoding="utf-8"))

    facts = json.loads((root / "site" / "data" / "facts.json").read_text(encoding="utf-8"))
    assert set(facts) == {"api.fixture-verified", "api.fixture-default", "api.fixture-priced"}
    assert facts["api.fixture-verified"]["verified_on"] == "2026-10-10"
    assert facts["api.fixture-verified"]["status"] == "verified"
    assert facts["api.fixture-default"]["kind"] == "docs"
    assert facts["api.fixture-default"]["status"] == "verified"
    assert "value" not in facts["api.fixture-verified"]
    priced = facts["api.fixture-priced"]
    assert priced["value"] == {"input_usd_per_mtok": 4, "output_usd_per_mtok": 20}
    assert priced["kind"] == "company-report"
    assert priced["verified_on"] == "2026-10-10"
    assert priced["status"] == "verified"

    terms = json.loads((root / "site" / "data" / "terms.json").read_text(encoding="utf-8"))
    assert terms["agent"]["module"] == "S0"
    assert terms["stop-reason"]["module"] == "A1"
    assert terms["stop-reason"]["term"] == "stop_reason"

    cards = json.loads((root / "site" / "data" / "cards" / "S0.json").read_text(encoding="utf-8"))
    assert cards[0]["id"] == "S0-c1"
    assert (root / "site" / "data" / "checks" / "S0.json").is_file()
    assert (root / "site" / "data" / "say" / "A1.json").is_file()
    assert not (root / "site" / "data" / "checks" / "A1.json").exists()


def test_readme_block_is_rewritten_and_the_rest_is_kept(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    run(root)
    readme = (root / "README.md").read_text(encoding="utf-8")
    assert README_BLOCK in readme
    assert "stale counts line" not in readme
    assert readme.startswith("# Fixture course\n\nText above the generated block is left alone.")
    assert readme.endswith("Text below the generated block is left alone.\n")


def test_outputs_are_byte_identical_across_runs(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    run(root)
    first = {p.relative_to(root): p.read_bytes() for p in (root / "site" / "data").rglob("*")
             if p.is_file()}
    run(root)
    second = {p.relative_to(root): p.read_bytes() for p in (root / "site" / "data").rglob("*")
              if p.is_file()}
    assert first == second and len(first) == 8  # README.md is outside site/data


def test_check_passes_right_after_a_write(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    run(root)
    capsys.readouterr()
    assert run(root, "--check") == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "gen_data: 9 files up to date"


def test_check_writes_nothing(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    assert run(root, "--check") == 1  # nothing has been written yet
    assert not (root / "site" / "data").exists()


def test_check_detects_a_stale_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    run(root)
    (root / "site" / "data" / "terms.json").write_text("{}\n", encoding="utf-8")
    capsys.readouterr()
    assert run(root, "--check") == 1
    out = capsys.readouterr().out
    assert "terms.json:0: stale; run python tools/gen_data.py" in out
    assert out.strip().splitlines()[-1] == "gen_data: FAILED (1 problems)"


def test_check_detects_a_missing_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    run(root)
    (root / "site" / "data" / "facts.json").unlink()
    capsys.readouterr()
    assert run(root, "--check") == 1
    assert "facts.json:0: missing" in capsys.readouterr().out


def test_check_reports_unexpected_files_under_site_data(tmp_path: Path,
                                                        capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    run(root)
    (root / "site" / "data" / "extra.json").write_text("[]\n", encoding="utf-8")
    capsys.readouterr()
    assert run(root, "--check") == 1
    assert "not produced by tools/gen_data.py" in capsys.readouterr().out


def test_missing_readme_markers_are_reported_and_the_readme_is_left_alone(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    readme = root / "README.md"
    readme.write_text("# No markers here\n", encoding="utf-8")
    assert run(root) == 1
    out = capsys.readouterr().out
    assert "README.md:0: README.md is missing the counts markers" in out
    assert readme.read_text(encoding="utf-8") == "# No markers here\n"
    assert (root / "site" / "data" / "course.json").is_file()
    assert out.strip().splitlines()[-1].startswith("gen_data: FAILED (1 problems); wrote 8 files")


def test_missing_readme_file_is_reported_and_not_created(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    (root / "README.md").unlink()
    assert run(root) == 1
    assert "README.md is missing" in capsys.readouterr().out
    assert not (root / "README.md").exists()
    assert (root / "site" / "data" / "terms.json").is_file()


def test_yaml_error_skips_that_output_and_names_the_line(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    (root / "facts" / "api.yaml").write_text("- id: api.bad\n  claim: [unclosed\n",
                                             encoding="utf-8")
    assert run(root) == 1
    out = capsys.readouterr().out
    assert any(line.startswith(str(root / "facts" / "api.yaml")) and "invalid YAML" in line
               and ":0:" not in line for line in out.splitlines())
    assert not (root / "site" / "data" / "facts.json").exists()
    assert (root / "site" / "data" / "course.json").is_file()


def test_duplicate_term_ids_across_files_fail(tmp_path: Path,
                                              capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    (root / "content" / "A1" / "terms.yaml").write_text(
        "- id: agent\n  term: agent\n  aliases: [agent]\n  strict: true\n  wire: loop\n"
        "  definition: x\n", encoding="utf-8")
    assert run(root) == 1
    assert "duplicate term id 'agent'" in capsys.readouterr().out


def test_facts_with_no_verified_entries_still_write_an_empty_object(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    (root / "facts" / "api.yaml").unlink()
    assert run(root) == 0
    assert json.loads((root / "site" / "data" / "facts.json").read_text(encoding="utf-8")) == {}
