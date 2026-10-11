"""BP-4.1 section 3: every Rein step from H5 on writes a trace the schema accepts.

For each step, the checkpoint runs under CPython in a fresh folder (the same setup, argv and stdin
that check_steps uses). Every line of trace.jsonl must validate against scenarios/trace.schema.json
(Draft 2020-12), seq must count up from 0, the last event must be run_end, and its status must be
the status word the checkpoint prints (its last line that starts with done or stopped; stopped means
max_turns in the schema).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import jsonschema
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import check_steps as cs  # noqa: E402

SCHEMA = json.loads((ROOT / "scenarios" / "trace.schema.json").read_text(encoding="utf-8"))
VALIDATOR = jsonschema.Draft202012Validator(SCHEMA)
PRINTED_TO_SCHEMA = {"done": "done", "stopped": "max_turns"}
TIMEOUT = 60.0


def steps_from_h5() -> list[cs.Step]:
    problems: list[cs.Problem] = []
    found = []
    for folder in sorted((ROOT / "steps").iterdir()):
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        if not (folder / "step.yaml").exists():
            continue
        step = cs.load_step(folder, problems)
        if step is not None and step.module.startswith("H") and step.number >= 5:
            found.append(step)
    assert problems == [], [p.render() for p in problems]
    return sorted(found, key=lambda s: s.number)


def run_checkpoint(step: cs.Step, shared: dict[str, str]) -> tuple[str, str]:
    """(stdout, trace text) of the checkpoint, run the way check_steps runs it."""
    env = {
        **os.environ,
        "PYTHONHASHSEED": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    with tempfile.TemporaryDirectory(prefix="trace-step-") as scratch:
        work = Path(scratch)
        files = {"rein.py": step.text, **step.scenarios}
        for path, text in files.items():
            (work / path).parent.mkdir(parents=True, exist_ok=True)
            (work / path).write_text(text, encoding="utf-8")
        for name in step.setup:
            (work / f"{name}.py").write_text(shared[name], encoding="utf-8")
            subprocess.run(
                [sys.executable, f"{name}.py"], cwd=work, env=env, input="",
                capture_output=True, text=True, encoding="utf-8", timeout=TIMEOUT, check=True,
            )
        stdin = "".join(f"{line}\n" for line in step.stdin)
        done = subprocess.run(
            [sys.executable, "rein.py", *step.argv], cwd=work, env=env, input=stdin,
            capture_output=True, text=True, encoding="utf-8", timeout=TIMEOUT, check=False,
        )
        assert done.returncode == 0, done.stderr[-400:]
        trace_path = work / "trace.jsonl"
        assert trace_path.exists(), "the run wrote no trace.jsonl"
        return done.stdout, trace_path.read_text(encoding="utf-8")


def printed_status(stdout: str) -> str:
    """The status word the checkpoint prints: its last line that starts with done or stopped."""
    words = [line.split()[0] for line in stdout.split("\n") if line.split()]
    return [w for w in words if w in PRINTED_TO_SCHEMA][-1]


STEPS = steps_from_h5()
SHARED = cs.load_shared(ROOT / "steps")


@pytest.mark.parametrize("step", STEPS, ids=[s.module for s in STEPS])
def test_the_checkpoint_trace_is_valid_and_ends_with_the_printed_status(step: cs.Step) -> None:
    stdout, text = run_checkpoint(step, SHARED)
    lines = text.split("\n")
    assert lines[-1] == "", "the trace must end with a newline"
    events = [json.loads(line) for line in lines[:-1]]
    assert events, "the trace is empty"
    for number, event in enumerate(events, start=1):
        errors = sorted(VALIDATOR.iter_errors(event), key=lambda e: list(e.path))
        assert not errors, f"line {number}: {errors[0].message}"
    assert [e["seq"] for e in events] == list(range(len(events))), (
        "seq must count up from 0 with no gaps"
    )
    assert len({e["run"] for e in events}) == 1, "every line of one run carries the same run"
    assert events[-1]["kind"] == "run_end", "the last event is run_end"
    printed = printed_status(stdout)
    assert events[-1]["status"] == PRINTED_TO_SCHEMA[printed], (
        f"status {events[-1]['status']} vs printed {printed}"
    )
