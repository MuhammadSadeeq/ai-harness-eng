"""Tests for the guarded stubs: each passes on empty input and fails loudly on non-empty input."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


steps = _load("check_steps")
scenarios = _load("check_scenarios")
wire = _load("check_wire")


def test_steps_pass_on_missing_or_empty_directory(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert steps.main(["--steps", str(tmp_path / "missing")]) == 0
    assert steps.main(["--steps", str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_steps: 0 steps (Rein steps arrive in Phase 2)"
    )


def test_steps_ignore_dotfiles_when_counting(tmp_path: Path) -> None:
    (tmp_path / ".gitkeep").write_text("", encoding="utf-8")
    assert steps.main(["--steps", str(tmp_path)]) == 0


def test_steps_fail_loudly_on_a_step(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "s01_loop.py").write_text("", encoding="utf-8")
    assert steps.main(["--steps", str(tmp_path)]) == 1
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_steps: FAILED (step checking not implemented yet)"
    )


def test_scenarios_pass_with_zero_tapes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert scenarios.main(["--scenarios", str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip() == "check_scenarios: 0 tapes"


def test_scenarios_schema_only_directory_still_has_zero_tapes(tmp_path: Path) -> None:
    (tmp_path / "schema.json").write_text(
        json.dumps({"type": "object", "required": ["id"]}), encoding="utf-8"
    )
    assert scenarios.main(["--scenarios", str(tmp_path)]) == 0


def test_scenarios_reject_a_tape_whose_id_differs_from_its_stem(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "loop-one.json").write_text(json.dumps({"id": "loop-two"}), encoding="utf-8")
    assert scenarios.main(["--scenarios", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "must equal the file stem 'loop-one'" in out
    assert out.strip().splitlines()[-1].startswith("check_scenarios: FAILED (")


def test_scenarios_fail_with_parity_after_schema_checks(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "schema.json").write_text(
        json.dumps({"type": "object", "required": ["id", "steps"]}), encoding="utf-8"
    )
    (tmp_path / "loop-ok.json").write_text(
        json.dumps({"id": "loop-ok", "steps": []}), encoding="utf-8"
    )
    (tmp_path / "loop-bad.json").write_text(json.dumps({"id": "loop-bad"}), encoding="utf-8")
    assert scenarios.main(["--scenarios", str(tmp_path)]) == 1
    out = capsys.readouterr().out.strip().splitlines()
    assert any("schema: 'steps' is a required property" in line for line in out), out
    assert any("parity not implemented (Phase 1)" in line for line in out), out
    assert out[-1] == "check_scenarios: FAILED (2 problems)"


def test_scenarios_schema_file_must_itself_be_valid(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "schema.json").write_text(json.dumps({"type": 12}), encoding="utf-8")
    assert scenarios.main(["--scenarios", str(tmp_path)]) == 1
    assert "schema is invalid" in capsys.readouterr().out


def test_wire_passes_with_no_payloads(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert wire.main(["--wire", str(tmp_path / "absent")]) == 0
    (tmp_path / ".gitkeep").write_text("", encoding="utf-8")
    assert wire.main(["--wire", str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip().splitlines()[-1] == "check_wire: 0 payloads"


def test_wire_fails_on_a_payload(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tmp_path / "request.json").write_text("{}", encoding="utf-8")
    assert wire.main(["--wire", str(tmp_path)]) == 1
    out = capsys.readouterr().out.strip().splitlines()
    assert "wire validation not implemented (Phase 1)" in out[0]
    assert out[-1] == "check_wire: FAILED (1 problems)"
