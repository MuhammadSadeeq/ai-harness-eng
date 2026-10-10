"""Tests for the step stub (still a guarded stub until Phase 2). The scenario and wire checkers
are real now and have their own tests: test_check_scenarios.py and test_check_wire.py."""

from __future__ import annotations

import importlib.util
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


def test_steps_fail_loudly_on_a_step(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tmp_path / "s01_loop.py").write_text("", encoding="utf-8")
    assert steps.main(["--steps", str(tmp_path)]) == 1
    assert capsys.readouterr().out.strip().splitlines()[-1] == (
        "check_steps: FAILED (step checking not implemented yet)"
    )
