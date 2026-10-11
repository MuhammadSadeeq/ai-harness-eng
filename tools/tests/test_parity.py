"""Tests for tools/parity.py, the learner's judge (BP-4.3 §1 and §2).

The judge runs the real Python runtime for the milestone checks; the mangled runtimes are small
wrapper scripts that call it and then break one line, so each test shows the judge names the right
line, seq and kind, or the right failure, without a runtime of its own.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shlex
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[2]
WRAPPER = """\
import json, os, re, subprocess, sys, time
mode = os.environ.get("PARITY_MANGLE", "")
if mode == "crash":
    sys.stderr.write("starting up\\nboom: something broke\\n")
    sys.exit(3)
if mode == "sleep":
    time.sleep(5)
    sys.exit(0)
args = sys.argv[1:]
done = subprocess.run([sys.executable, "-m", "rein.sim", *args], capture_output=True, text=True,
                      cwd=os.environ["PARITY_ROOT"], check=False)
out = done.stdout.splitlines()
if mode == "wire-extra" and "--wire" in args:
    out.append('{"extra":1}')
kind = os.environ.get("PARITY_KIND", "")
for index, line in enumerate(out):
    event = json.loads(line)
    if not isinstance(event, dict) or event.get("kind") != kind:
        continue
    if mode == "drop":
        del event["output_tokens"]
        out[index] = json.dumps(event, sort_keys=True, separators=(",", ":"))
    elif mode == "reorder":
        reversed_event = dict(reversed(list(event.items())))
        out[index] = json.dumps(reversed_event, separators=(",", ":"))
    elif mode == "float":
        out[index] = re.sub(r'"t":(\\d+)', r'"t":\\1.0', line, count=1)
    break
sys.stdout.write("".join(line + "\\n" for line in out))
sys.exit(done.returncode)
"""


def load_parity() -> ModuleType:
    spec = importlib.util.spec_from_file_location("parity", ROOT / "tools" / "parity.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parity = load_parity()


@pytest.fixture
def py_runtime(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("PYTHONPATH", str(ROOT / "rein" / "src"))
    return shlex.join([sys.executable, "-m", "rein.sim", "run"])


def mangler(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, kind: str = "") -> str:
    script = tmp_path / "wrapper.py"
    script.write_text(WRAPPER, encoding="utf-8")
    monkeypatch.setenv("PARITY_MANGLE", mode)
    monkeypatch.setenv("PARITY_KIND", kind)
    monkeypatch.setenv("PARITY_ROOT", str(ROOT))
    monkeypatch.setenv("PYTHONPATH", str(ROOT / "rein" / "src"))
    return shlex.join([sys.executable, str(script), "run"])


def golden_tree_digest() -> dict[str, str]:
    base = ROOT / "scenarios" / "golden"
    return {
        str(path.relative_to(base)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(base.rglob("*"))
        if path.is_file()
    }


def test_every_golden_gets_a_milestone() -> None:
    goldens = parity.discover(ROOT)
    assigned = parity.assign(ROOT, goldens)
    assert goldens, "the course has golden runs"
    assert set(assigned) == {golden.label for golden in goldens}
    for label, assignment in assigned.items():
        assert assignment.milestone in parity.ORDER, label


def test_milestones_file_names_the_seven_milestones_and_known_features() -> None:
    config = parity.load_config(ROOT)
    assert list(config["milestones"]) == list(parity.ORDER)
    ids = [feature["id"] for feature in config["features"]]
    assert len(ids) == len(set(ids))
    assert {feature["milestone"] for feature in config["features"]} == set(parity.ORDER) - {"M1"}


def test_a_milestones_file_without_all_seven_is_refused(tmp_path: Path) -> None:
    capstone = tmp_path / "capstone"
    capstone.mkdir()
    (capstone / "milestones.json").write_text(
        json.dumps({"milestones": {"M1": "core"}, "features": []}), encoding="utf-8"
    )
    with pytest.raises(parity.ParityError, match="in that order"):
        parity.load_config(tmp_path)


def test_assign_prints_each_golden_with_its_milestone(capsys: pytest.CaptureFixture[str]) -> None:
    assert parity.main(["--assign"]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == len(parity.discover(ROOT))
    for line in lines:
        label, milestone, _features = line.split(" ", 2)
        assert milestone in parity.ORDER, label


def test_the_python_runtime_matches_the_m1_goldens(
    py_runtime: str, capsys: pytest.CaptureFixture[str]
) -> None:
    before = golden_tree_digest()
    assert parity.main(["--cmd", py_runtime, "--milestone", "M1"]) == 0
    assert golden_tree_digest() == before, "the judge must never edit a golden"
    last = capsys.readouterr().out.strip().splitlines()[-1]
    goldens = parity.discover(ROOT)
    assigned = parity.assign(ROOT, goldens)
    m1 = sum(1 for g in goldens if assigned[g.label].milestone == "M1")
    assert last == f"parity: {m1} of {m1} runs match (M1–M1)"


def test_only_limits_the_runs_to_one_tape(
    py_runtime: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert parity.main(["--cmd", py_runtime, "--only", "d1-example-a"]) == 0
    last = capsys.readouterr().out.strip().splitlines()[-1]
    assert last == "parity: 6 of 6 runs match (M1–M1)", last


def test_a_dropped_field_is_named_by_its_line_seq_and_kind(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    cmd = mangler(tmp_path, monkeypatch, "drop", "tool_call")
    assert parity.main(["--cmd", cmd, "--only", "d1-example-a"]) == 1
    out = capsys.readouterr().out.splitlines()
    failing = [line for line in out if line.startswith("d1-example-a.")]
    assert failing, out
    for line in failing:
        assert "kind tool_call" in line and "seq " in line and "got " in line, line
    assert out[-1] == "parity: 0 of 6 runs match (M1–M1)", out[-1]


def test_reordered_keys_and_a_float_are_caught_on_the_right_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for mode in ("reorder", "float"):
        cmd = mangler(tmp_path, monkeypatch, mode, "run_start")
        assert parity.main(["--cmd", cmd, "--only", "d1-example-b"]) == 1
        lines = capsys.readouterr().out.splitlines()
        first = next(line for line in lines if line.startswith("d1-example-b."))
        assert "line 1 (seq 0, kind run_start)" in first, first
        assert "got " in first and "expected " in first, first


def test_a_crash_is_a_failing_run_with_the_last_stderr_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    cmd = mangler(tmp_path, monkeypatch, "crash")
    assert parity.main(["--cmd", cmd, "--only", "d1-example-a"]) == 1
    out = capsys.readouterr().out
    assert "exit 3: boom: something broke" in out
    assert out.strip().splitlines()[-1] == "parity: 0 of 6 runs match (M1–M1)"


def test_a_run_past_the_timeout_is_a_failing_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(parity, "TIMEOUT_S", 0.5)
    cmd = mangler(tmp_path, monkeypatch, "sleep")
    assert parity.main(["--cmd", cmd, "--only", "d1-example-a", "--jobs", "12"]) == 1
    out = capsys.readouterr().out
    assert "timed out after 0.5 s" in out


def test_a_wire_digest_that_differs_fails_the_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    cmd = mangler(tmp_path, monkeypatch, "wire-extra")
    assert parity.main(["--cmd", cmd, "--only", "d1-example-a"]) == 1
    out = capsys.readouterr().out
    assert "--wire: sha256" in out and "differs from the golden's" in out


def test_a_missing_binary_is_a_usage_error(capsys: pytest.CaptureFixture[str]) -> None:
    assert parity.main(["--cmd", "no-such-binary-for-parity run"]) == 2
    assert "not found on PATH" in capsys.readouterr().err


def test_the_command_must_end_in_run(capsys: pytest.CaptureFixture[str]) -> None:
    assert parity.main(["--cmd", "node tools/sim_cli.mjs"]) == 2
    assert 'must end with "run"' in capsys.readouterr().err


def test_an_unknown_milestone_is_refused(capsys: pytest.CaptureFixture[str]) -> None:
    assert parity.main(["--cmd", "python run", "--milestone", "M9"]) == 2
    assert "--milestone must be one of M1" in capsys.readouterr().err
