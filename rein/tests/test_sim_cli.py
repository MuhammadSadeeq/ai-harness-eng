"""The CLI (ENGINE.md section 10): canonical JSONL on stdout, exit 2 on errors, byte-identical
tool definitions with the shared fixture."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from support import BOARDS, FACTS_PATH, ROOT, SCENARIOS

from rein.sim import main

RUN = ["run", "--tape", str(SCENARIOS / "b2-spiral.json"), "--board", str(BOARDS / "b2-new.json")]


def test_tooldefs_copy_is_byte_identical_to_the_fixture() -> None:
    fixture = (SCENARIOS / "fixtures" / "tooldefs.json").read_bytes()
    packaged = (ROOT / "rein" / "src" / "rein" / "tooldefs.json").read_bytes()
    assert packaged == fixture


def test_cli_prints_canonical_events(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([*RUN, "--seed", "1", "--facts", str(FACTS_PATH)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 100
    first = json.loads(lines[0])
    assert first["kind"] == "run_start" and first["run"] == "b2-spiral:b2-new:1"
    assert lines[0] == json.dumps(first, sort_keys=True, separators=(",", ":"))
    assert json.loads(lines[-1])["kind"] == "run_end"
    assert json.loads(lines[-1])["status"] == "max_turns"


def test_cli_prints_wire_payloads_with_wire(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([*RUN, "--seed", "1", "--wire", "--facts", str(FACTS_PATH)]) == 0
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert len(lines) == 24  # two payloads for each of 12 turns
    assert "messages" in lines[0] and lines[1]["type"] == "message"


def test_fact_pricing_without_facts_is_exit_two(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # Outside the repository, so no site/data/facts.json is found from here.
    tape = tmp_path / "b2-spiral.json"
    tape.write_text((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"), encoding="utf-8")
    board = tmp_path / "b2-new.json"
    board.write_text((BOARDS / "b2-new.json").read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    assert main(["run", "--tape", str(tape), "--board", str(board), "--seed", "1"]) == 2
    assert "--facts" in capsys.readouterr().err


def test_bad_tape_is_exit_two(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text('{"id": "x", "window": 1.5}', encoding="utf-8")
    code = main(["run", "--tape", str(bad), "--board", str(BOARDS / "b2-old.json"), "--seed", "1"])
    assert code == 2
    assert "integers only" in capsys.readouterr().err


def test_negative_seed_is_exit_two(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([*RUN, "--seed", "-1", "--facts", str(FACTS_PATH)]) == 2
    assert "--seed" in capsys.readouterr().err


def test_python_dash_m_runs_the_cli() -> None:
    env = {**os.environ, "PYTHONPATH": str(ROOT / "rein" / "src")}
    done = subprocess.run(
        [sys.executable, "-m", "rein.sim", *RUN, "--seed", "1", "--facts", str(FACTS_PATH)],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    assert done.returncode == 0
    assert done.stdout.splitlines()[-1].startswith(
        '{"agent":"main","cost":26438000,"kind":"run_end"'
    )


def test_a3_13_a_script_that_cannot_reply_is_exit_two(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["script"] = [
        {"repeat": {"steps": [{"branch": [{"percent": 100, "then": []}]}], "times": "forever"}}
    ]
    tape_path = tmp_path / "stuck.json"
    tape_path.write_text(json.dumps(raw), encoding="utf-8")
    code = main(
        [
            "run",
            "--tape",
            str(tape_path),
            "--board",
            str(BOARDS / "b2-old.json"),
            "--seed",
            "1",
            "--facts",
            str(FACTS_PATH),
        ]
    )
    assert code == 2
    assert "without a reply" in capsys.readouterr().err
