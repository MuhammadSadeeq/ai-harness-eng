#!/usr/bin/env python3
"""The learner's judge: does a runtime reproduce the course's golden traces? (BP-4.3 §1, D-046).

    python tools/parity.py --cmd "<command> run" [--milestone M3] [--only TAPE] [--jobs N]
    python tools/parity.py --assign                  (each golden's milestone and features)

A run golden is judged as ``<command> run --tape T --board B --seed N --facts F``. Its stdout
must equal scenarios/golden/<tape>.<board>.<seed>.jsonl byte for byte. The same run again with
``--wire`` must print output whose SHA-256 equals scenarios/golden/<...>.wire.sha256. An eval
golden (scenarios/golden/evals/<eval>.<board>.json) is judged as ``<command> eval --eval E --board B
--scenarios scenarios --facts F``, byte for byte. ``F`` is always site/data/facts.json, so every
runtime prices the same way. One golden entry is one run: it matches only when both its checks do.

A run that exits non-zero, or runs past 10 s, is a failing run, and its message ends with the last
line of the command's stderr. A command that cannot be found is a usage error (exit 2).

Each failing run prints one line: the first differing line of the output, its golden ``seq`` and
``kind``, and both sides. The last line is ``parity: <k> of <n> runs match (M1–M3)``. The exit
status is 0 only when every run matches. This file never edits a golden. The course has no
--choices goldens (choice coverage is checked by tools/check_scenarios.py), so no judge run uses
--choices.

Milestones come from capstone/milestones.json: each golden belongs to the lowest milestone whose
features its tape, board or events use (see ``assign``).
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
TIMEOUT_S = 10.0
ORDER = ("M1", "M2", "M3", "M4", "M5", "M6", "M7")
SHOWN = 200  # characters of a line shown on each side of a difference


class ParityError(Exception):
    """A usage problem, not a failing run: a missing command, a bad milestones file, no runs."""


@dataclass(frozen=True)
class Golden:
    """One golden entry: a run (tape, board, seed) or an eval (eval id, board)."""

    label: str
    kind: str  # "run" or "eval"
    name: str  # the tape id, or the eval id
    board: str
    seed: int
    engine: bool
    golden: Path  # the run's JSONL trace, or the eval's one-line object
    spec: Path  # the tape file, or the eval file
    board_file: Path
    digest: Path | None  # the run's .wire.sha256, when it has one


@dataclass(frozen=True)
class Assignment:
    milestone: str
    features: tuple[str, ...]


@dataclass(frozen=True)
class Outcome:
    label: str
    ok: bool
    message: str = ""


# ---- discovery -----------------------------------------------------------------------------------


def _scenario_dir(root: Path, engine: bool) -> Path:
    return root / "scenarios" / "engine" if engine else root / "scenarios"


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ParityError(f"cannot read {path}: {exc}") from exc


def discover(root: Path) -> list[Golden]:
    """Every golden entry: the runs (scenarios/golden/ and golden/engine/) and the evals."""
    found: list[Golden] = []
    for engine in (False, True):
        scenarios = _scenario_dir(root, engine)
        golden_dir = root / "scenarios" / "golden" / ("engine" if engine else "")
        for path in sorted(golden_dir.glob("*.jsonl")):
            parts = path.name[: -len(".jsonl")].split(".")
            if len(parts) != 3 or not parts[2].isdigit():
                raise ParityError(f"{path.name}: a run golden is named <tape>.<board>.<seed>.jsonl")
            tape, board, seed = parts[0], parts[1], int(parts[2])
            digest = path.with_name(path.name[: -len(".jsonl")] + ".wire.sha256")
            found.append(
                Golden(
                    f"{tape}.{board}.{seed}",
                    "run",
                    tape,
                    board,
                    seed,
                    engine,
                    path,
                    scenarios / f"{tape}.json",
                    scenarios / "boards" / f"{board}.json",
                    digest if digest.is_file() else None,
                )
            )
    for path in sorted((root / "scenarios" / "golden" / "evals").glob("*.json")):
        eval_id, _, board = path.name[: -len(".json")].partition(".")
        if not board:
            raise ParityError(f"{path.name}: an eval golden is named <eval>.<board>.json")
        engine_spec = root / "scenarios" / "engine" / "evals" / f"{eval_id}.json"
        plain_spec = root / "scenarios" / "evals" / f"{eval_id}.json"
        if engine_spec.is_file():
            engine, spec = True, engine_spec
        elif plain_spec.is_file():
            engine, spec = False, plain_spec
        else:
            raise ParityError(f"{path.name}: no eval file for {eval_id!r}")
        found.append(
            Golden(
                f"eval:{eval_id}.{board}",
                "eval",
                eval_id,
                board,
                0,
                engine,
                path,
                spec,
                _scenario_dir(root, engine) / "boards" / f"{board}.json",
                None,
            )
        )
    return found


# ---- milestones ----------------------------------------------------------------------------------


def load_config(root: Path) -> dict[str, Any]:
    path = root / "capstone" / "milestones.json"
    config = _load_json(path)
    if not isinstance(config, dict) or not isinstance(config.get("milestones"), dict):
        raise ParityError(f"{path.name}: needs a 'milestones' object")
    if list(config["milestones"]) != list(ORDER):
        raise ParityError(f"{path.name}: 'milestones' must be {', '.join(ORDER)} in that order")
    features = config.get("features")
    if not isinstance(features, list):
        raise ParityError(f"{path.name}: needs a 'features' list")
    seen: set[str] = set()
    for feature in features:
        if not isinstance(feature, dict) or not isinstance(feature.get("id"), str):
            raise ParityError(f"{path.name}: every feature needs an 'id'")
        if feature.get("milestone") not in ORDER:
            raise ParityError(f"{path.name}: feature {feature['id']!r} needs a milestone M1..M7")
        if feature["id"] in seen:
            raise ParityError(f"{path.name}: feature {feature['id']!r} is listed twice")
        seen.add(feature["id"])
    return config


def _has_path(node: Any, parts: list[str]) -> bool:
    """True when the path holds a non-empty value; a list is searched item by item."""
    if not parts:
        return node not in (None, [], {}, "")
    if isinstance(node, list):
        return any(_has_path(item, parts) for item in node)
    if isinstance(node, dict) and node.get(parts[0]) is not None:
        return _has_path(node[parts[0]], parts[1:])
    return False


def _has_key(data: Any, dotted: str) -> bool:
    return _has_path(data, dotted.split("."))


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _event_has(event: dict[str, Any], rule: str) -> bool:
    """A rule is an event kind, or kind.field=value with the value as canonical JSON."""
    kind, _, condition = rule.partition(".")
    if event.get("kind") != kind:
        return False
    if not condition:
        return True
    field_name, _, value = condition.partition("=")
    return _canonical(event.get(field_name)) == value


def used_features(
    config: dict[str, Any], docs: list[Any], events: list[dict[str, Any]]
) -> list[str]:
    """The feature ids a golden uses: a key its documents declare, a text it contains, or an event.

    A feature lists keys under "tape", "board" and "eval" (dotted paths; a list is searched item
    by item), substrings under "text" (found in the JSON of the tape, board or eval), and event
    rules under "events". ``docs`` holds the golden's tape, board and eval documents.
    """
    used: list[str] = []
    for feature in config["features"]:
        keys = feature.get("tape", []) + feature.get("board", []) + feature.get("eval", [])
        declared = any(_has_key(doc, key) for doc in docs for key in keys)
        texts = [json.dumps(doc, ensure_ascii=False) for doc in docs]
        written = any(needle in text for text in texts for needle in feature.get("text", []))
        recorded = any(
            _event_has(event, rule) for event in events for rule in feature.get("events", [])
        )
        if declared or written or recorded:
            used.append(feature["id"])
    return used


def _read_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        if isinstance(event, dict):
            events.append(event)
    return events


def assign(root: Path, goldens: list[Golden]) -> dict[str, Assignment]:
    """label -> Assignment: the lowest milestone that has every feature the golden uses.

    A golden's milestone is the highest of M1 (the core) and the milestones of its features, so a
    golden using an M3 feature belongs to M3. The features come from the golden's tape, board and
    events; an eval's features come from its own file, its board and every tape it runs.
    """
    config = load_config(root)
    by_feature = {feature["id"]: feature["milestone"] for feature in config["features"]}
    assigned: dict[str, Assignment] = {}
    for golden in goldens:
        board_file = _load_json(golden.board_file)
        # A board's feature keys name its modules ("sandbox.egress"), not the file's own keys.
        modules = board_file.get("modules", {}) if isinstance(board_file, dict) else {}
        # A module with no parameters ({}) still counts: its key is the evidence, so it is True.
        board = {k: (v if v else True) for k, v in modules.items()}
        if golden.kind == "eval":
            spec = _load_json(golden.spec)
            tapes = [
                _load_json(_scenario_dir(root, golden.engine) / f"{task['tape']}.json")
                if (_scenario_dir(root, golden.engine) / f"{task['tape']}.json").is_file()
                else _load_json(root / "scenarios" / "engine" / f"{task['tape']}.json")
                for task in spec.get("tasks", [])
            ]
            docs: list[Any] = [spec, board, *tapes]
            events: list[dict[str, Any]] = []
        else:
            docs = [_load_json(golden.spec), board]
            events = _read_events(golden.golden)
        used = used_features(config, docs, events)
        milestone = max(["M1", *(by_feature[feature] for feature in used)], key=ORDER.index)
        assigned[golden.label] = Assignment(milestone, tuple(used))
    return assigned


# ---- running -------------------------------------------------------------------------------------


def parse_cmd(text: str) -> list[str]:
    cmd = shlex.split(text)
    if not cmd or cmd[-1] != "run":
        raise ParityError(
            '--cmd must end with "run", for example --cmd "node tools/sim_cli.mjs run"'
        )
    return cmd


def check_binary(name: str, root: Path) -> None:
    """A missing command is a usage error, reported before any run starts."""
    if "/" in name:
        path = root / name
        if path.is_file() and os.access(path, os.X_OK):
            return
        raise ParityError(f"cannot run {name!r}: no executable at {path} (build it first)")
    if shutil.which(name) is None:
        raise ParityError(f"cannot run {name!r}: not found on PATH")


def _argv(cmd: list[str], golden: Golden, root: Path, *, wire: bool) -> list[str]:
    facts = str(root / "site" / "data" / "facts.json")
    if golden.kind == "eval":
        return [
            *cmd[:-1],
            "eval",
            "--eval",
            str(golden.spec),
            "--board",
            str(golden.board_file),
            "--scenarios",
            str(root / "scenarios"),
            "--facts",
            facts,
        ]
    argv = [
        *cmd,
        "--tape",
        str(golden.spec),
        "--board",
        str(golden.board_file),
        "--seed",
        str(golden.seed),
        "--facts",
        facts,
    ]
    return [*argv, "--wire"] if wire else argv


def _last_stderr_line(stderr: bytes | None) -> str:
    lines = [
        line for line in (stderr or b"").decode("utf-8", "replace").splitlines() if line.strip()
    ]
    return f": {lines[-1]}" if lines else ""


def _execute(
    argv: list[str], root: Path, label: str
) -> tuple[subprocess.CompletedProcess[bytes] | None, str]:
    """The finished process, or None with the message that makes this a failing run."""
    try:
        done = subprocess.run(
            argv,
            capture_output=True,
            timeout=TIMEOUT_S,
            cwd=root,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return None, f"{label}: timed out after {TIMEOUT_S:g} s{_last_stderr_line(exc.stderr)}"
    except OSError as exc:
        return None, f"{label}: could not run the command: {exc.strerror or exc}"
    if done.returncode != 0:
        return None, f"{label}: exit {done.returncode}{_last_stderr_line(done.stderr)}"
    return done, ""


def _show(line: str) -> str:
    return repr(line[:SHOWN]) + ("…" if len(line) > SHOWN else "")


def _where(line: str | None) -> str:
    """The seq and kind of a golden line, when it is an event."""
    if line is None:
        return ""
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return ""
    if not isinstance(event, dict):
        return ""
    parts = [f"seq {event['seq']}"] if "seq" in event else []
    if "kind" in event:
        parts.append(f"kind {event['kind']}")
    return f" ({', '.join(parts)})" if parts else ""


def first_difference(want: bytes, got: bytes) -> str:
    """One line naming the first differing line of the output, with both sides."""
    want_lines = want.decode("utf-8", "replace").splitlines()
    got_lines = got.decode("utf-8", "replace").splitlines()
    for index in range(max(len(want_lines), len(got_lines))):
        expected = want_lines[index] if index < len(want_lines) else None
        actual = got_lines[index] if index < len(got_lines) else None
        if expected == actual:
            continue
        if expected is None and actual is not None:
            return f"line {index + 1}: the output has an extra line {_show(actual)}"
        if actual is None and expected is not None:
            return (
                f"line {index + 1}{_where(expected)}: the output stops; expected {_show(expected)}"
            )
        return (
            f"line {index + 1}{_where(expected)}: got {_show(actual or '')}, "
            f"expected {_show(expected or '')}"
        )
    return "the bytes differ after the last line (check the final newline)"


def judge(root: Path, cmd: list[str], golden: Golden) -> Outcome:
    done, problem = _execute(_argv(cmd, golden, root, wire=False), root, golden.label)
    if done is None:
        return Outcome(golden.label, False, problem)
    want = golden.golden.read_bytes()
    if done.stdout != want:
        return Outcome(
            golden.label, False, f"{golden.label}: {first_difference(want, done.stdout)}"
        )
    if golden.digest is None:
        return Outcome(golden.label, True)
    label = f"{golden.label} --wire"
    wired, problem = _execute(_argv(cmd, golden, root, wire=True), root, label)
    if wired is None:
        return Outcome(golden.label, False, problem)
    got = hashlib.sha256(wired.stdout).hexdigest()
    expected = golden.digest.read_text(encoding="utf-8").strip()
    if got != expected:
        return Outcome(
            golden.label, False, f"{label}: sha256 {got} differs from the golden's {expected}"
        )
    return Outcome(golden.label, True)


def run_parity(
    root: Path, cmd: list[str], milestone: str | None, only: str | None, jobs: int
) -> tuple[list[Outcome], str]:
    goldens = discover(root)
    assigned = assign(root, goldens)
    cutoff = ORDER.index(milestone) if milestone else len(ORDER) - 1
    chosen = [
        golden
        for golden in goldens
        if ORDER.index(assigned[golden.label].milestone) <= cutoff
        and (only is None or golden.name == only)
    ]
    if not chosen:
        raise ParityError(f"no golden run is in the chosen milestones (--only {only or '-'})")
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        outcomes = list(pool.map(lambda golden: judge(root, cmd, golden), chosen))
    top = max((assigned[golden.label].milestone for golden in chosen), key=ORDER.index)
    return outcomes, f"M1–{milestone or top}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Judge a runtime against the course's golden traces."
    )
    parser.add_argument(
        "--cmd", help='the command, ending in "run" (for example "node tools/sim_cli.mjs run")'
    )
    parser.add_argument("--milestone", help="judge the goldens of M1 up to this milestone (M1..M7)")
    parser.add_argument("--only", metavar="TAPE", help="judge only this tape or eval id")
    parser.add_argument("--jobs", type=int, default=4, help="runs at a time (default 4)")
    parser.add_argument(
        "--assign", action="store_true", help="print each golden's milestone and features"
    )
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        if args.assign:
            for label, assignment in sorted(assign(args.root, discover(args.root)).items()):
                print(f"{label} {assignment.milestone} {' '.join(assignment.features) or '-'}")
            return 0
        if args.cmd is None:
            parser.error("--cmd is required (unless --assign)")
        cmd = parse_cmd(args.cmd)
        if args.milestone is not None and args.milestone not in ORDER:
            raise ParityError(f"--milestone must be one of {', '.join(ORDER)}")
        check_binary(cmd[0], args.root)
        outcomes, span = run_parity(args.root, cmd, args.milestone, args.only, args.jobs)
    except ParityError as exc:
        print(f"parity: {exc}", file=sys.stderr)
        return 2
    failing = [outcome for outcome in outcomes if not outcome.ok]
    for outcome in failing:
        print(outcome.message)
    print(f"parity: {len(outcomes) - len(failing)} of {len(outcomes)} runs match ({span})")
    return 1 if failing else 0


if __name__ == "__main__":
    raise SystemExit(main())
