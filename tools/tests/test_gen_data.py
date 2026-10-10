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
    expected = (
        json.dumps(
            {"a": "é", "b": 1, "when": "2026-10-10"}, indent=1, ensure_ascii=False, sort_keys=True
        )
        + "\n"
    )
    assert dump_json(value) == expected


def test_write_creates_every_output(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = copy_root(tmp_path)
    assert run(root) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "gen_data: wrote 13 files"

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
    assert (root / "site" / "data" / "katas" / "A1-loop.json").is_file()
    assert (root / "site" / "data" / "katas" / "T1-typing.json").is_file()
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
    first = {
        p.relative_to(root): p.read_bytes()
        for p in (root / "site" / "data").rglob("*")
        if p.is_file()
    }
    run(root)
    second = {
        p.relative_to(root): p.read_bytes()
        for p in (root / "site" / "data").rglob("*")
        if p.is_file()
    }
    assert first == second and len(first) == 12  # README.md is outside site/data


def test_check_passes_right_after_a_write(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    run(root)
    capsys.readouterr()
    assert run(root, "--check") == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "gen_data: 13 files up to date"


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


def test_check_reports_unexpected_files_under_site_data(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
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
    assert out.strip().splitlines()[-1].startswith("gen_data: FAILED (1 problems); wrote 12 files")


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
    (root / "facts" / "api.yaml").write_text(
        "- id: api.bad\n  claim: [unclosed\n", encoding="utf-8"
    )
    assert run(root) == 1
    out = capsys.readouterr().out
    assert any(
        line.startswith(str(root / "facts" / "api.yaml"))
        and "invalid YAML" in line
        and ":0:" not in line
        for line in out.splitlines()
    )
    assert not (root / "site" / "data" / "facts.json").exists()
    assert (root / "site" / "data" / "course.json").is_file()


def test_duplicate_term_ids_across_files_fail(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    (root / "content" / "A1" / "terms.yaml").write_text(
        "- id: agent\n  term: agent\n  aliases: [agent]\n  strict: true\n  wire: loop\n"
        "  definition: x\n",
        encoding="utf-8",
    )
    assert run(root) == 1
    assert "duplicate term id 'agent'" in capsys.readouterr().out


def test_facts_with_no_verified_entries_still_write_an_empty_object(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    (root / "facts" / "api.yaml").unlink()
    assert run(root) == 0
    assert json.loads((root / "site" / "data" / "facts.json").read_text(encoding="utf-8")) == {}


def test_tapes_and_boards_are_copied_byte_for_byte(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    (root / "scenarios" / "boards").mkdir(parents=True, exist_ok=True)
    tape = '{"id": "t1", "b": 1, "a": [2, 1]}\n'  # unsorted keys and spacing must survive
    (root / "scenarios" / "t1.json").write_text(tape, encoding="utf-8")
    (root / "scenarios" / "schema.json").write_text("{}\n", encoding="utf-8")
    (root / "scenarios" / "boards" / "x.json").write_text('{"id": "x"}', encoding="utf-8")
    assert run(root) == 0
    assert (root / "site/data/scenarios/t1.json").read_text(encoding="utf-8") == tape
    assert (root / "site/data/scenarios/boards/x.json").read_text(encoding="utf-8") == '{"id": "x"}'
    assert not (root / "site/data/scenarios/schema.json").exists()
    assert run(root, "--check") == 0


KATA_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "katas"
KATA_FIELDS = {
    "id",
    "module",
    "title",
    "objectives",
    "minutes",
    "hints",
    "from_memory",
    "starter",
    "solution",
    "tests",
}


def add_kata(root: Path, name: str) -> Path:
    target = root / "katas" / name
    shutil.copytree(KATA_FIXTURES / name, target)
    return target


def test_a_kata_compiles_to_one_json_file_with_the_listed_fields(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    add_kata(root, "good-add")
    assert run(root) == 0
    text = (root / "site/data/katas/good-add.json").read_text(encoding="utf-8")
    data = json.loads(text)
    assert set(data) == KATA_FIELDS, "wrong_solutions must not reach the browser"
    assert text == dump_json(data), "the file uses the same deterministic form as every output"
    assert data["id"] == "good-add" and data["module"] == "B2" and data["from_memory"] is False
    source = KATA_FIXTURES / "good-add"
    assert data["starter"] == (source / "starter.py").read_text(encoding="utf-8")
    assert data["tests"] == (source / "test_kata.py").read_text(encoding="utf-8")
    assert run(root, "--check") == 0


def test_a_lab_kata_compiles_with_a_null_module_and_no_objectives(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    add_kata(root, "lab-ok")
    assert run(root) == 0
    data = json.loads((root / "site/data/katas/lab-ok.json").read_text(encoding="utf-8"))
    assert data["module"] is None and data["objectives"] == []


def test_a_kata_missing_a_key_is_reported_and_its_json_is_not_written(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    target = add_kata(root, "good-add")
    (target / "meta.yaml").write_text(
        "id: good-add\nmodule: B2\ntitle: Add two numbers\nobjectives:\n  - B2.o1\n"
        "minutes: 5\nfrom_memory: false\n",
        encoding="utf-8",
    )
    assert run(root) == 1
    assert "missing key 'hints'" in capsys.readouterr().out
    assert not (root / "site/data/katas/good-add.json").exists()
    assert run(root, "--check") == 1
    assert "not produced" not in capsys.readouterr().out


def test_check_detects_a_stale_kata_file(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    target = add_kata(root, "good-add")
    assert run(root) == 0
    (target / "starter.py").write_text("def add(a, b):\n    return 1\n", encoding="utf-8")
    assert run(root, "--check") == 1
    out = capsys.readouterr().out
    assert "good-add.json" in out and "stale" in out


REPO_STEPS = Path(__file__).resolve().parents[2] / "steps"


def test_steps_compile_to_one_json_each_with_their_shared_script(tmp_path: Path) -> None:
    root = copy_root(tmp_path)
    shutil.copytree(REPO_STEPS, root / "steps")
    assert run(root) == 0
    data = json.loads((root / "site/data/steps/H1.json").read_text(encoding="utf-8"))
    assert data["id"] == "H1" and data["size"] == "rein.py starts at 105 lines"
    assert data["rein"] == (REPO_STEPS / "H1" / "rein.py").read_text(encoding="utf-8")
    command = 'python rein.py "Say hello" --fake scenarios/01_hello.json'
    assert data["checkpoint"]["command"] == command
    h2 = json.loads((root / "site/data/steps/H2.json").read_text(encoding="utf-8"))
    assert set(h2["shared"]) == {"reset_demo"} and h2["checkpoint"]["setup"] == ["reset_demo"]
    assert len(h2["breaks"]) == 3 and "run" in h2["breaks"][0]
    assert run(root, "--check") == 0


def test_a_step_that_cannot_be_read_is_named_and_skipped(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = copy_root(tmp_path)
    shutil.copytree(REPO_STEPS, root / "steps")
    (root / "steps" / "H2" / "step.yaml").write_text("module: H2\nnumber: [\n", encoding="utf-8")
    assert run(root) == 1
    out = capsys.readouterr().out
    assert "invalid YAML" in out
    assert not (root / "site/data/steps/H2.json").exists()


ENGINE_SOURCE = Path(__file__).resolve().parents[2] / "scenarios" / "engine"


def test_engine_tapes_and_their_boards_are_not_copied_to_the_site(tmp_path: Path) -> None:
    """A8.6: the engine tapes are checked, not shipped: the generator copies only the top level."""
    root = copy_root(tmp_path)
    engine = root / "scenarios" / "engine"
    (engine / "boards").mkdir(parents=True)
    shutil.copy(ENGINE_SOURCE / "eng-split.json", engine / "eng-split.json")
    shutil.copy(
        ENGINE_SOURCE / "boards" / "eng-split-split.json",
        engine / "boards" / "eng-split-split.json",
    )
    shutil.copy(
        ENGINE_SOURCE.parent / "b2-spiral.json", root / "scenarios" / "b2-spiral.json"
    )  # control
    assert run(root) == 0
    assert (root / "site" / "data" / "scenarios" / "b2-spiral.json").is_file()
    copied = [path for path in (root / "site" / "data").rglob("*") if path.name.startswith("eng-")]
    assert copied == []
