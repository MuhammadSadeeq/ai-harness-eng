"""check_scenarios: validate scenario tapes and boards, then check Rein against the JS simulator.

Tapes are scenarios/*.json (not the *schema.json files); boards are scenarios/boards/<id>.json.
For every tape x its boards x its golden seeds, the Python harness (in-process) and the JS
simulator (``node tools/sim_cli.mjs run ...``, a subprocess) must produce identical output, line
by line (ENGINE.md section 10): the events, the wire payloads, and the branch choices (A3.22,
``--choices``). Events must validate against scenarios/trace.schema.json, and the output must
match scenarios/golden/<tape>.<board>.<seed>.jsonl in full, and the wire output's SHA-256 in
scenarios/golden/<tape>.<board>.<seed>.wire.sha256 (A3.23, D-042). Parity compares the full wire
output of both runtimes on every check; the digest only guards the Python output over time.

Branch coverage (A3.22): across the tape's boards and golden seeds, every option of every branch
step that a run reaches must be taken at least once; an untaken option is a problem.

``--update <tape>`` rewrites golden files from Python, only when JS matches on every run.
``--suggest-seeds N`` prints, per tape, a small set of seeds among 0..N-1 that covers every
reachable branch option (print only).

Last line: ``check_scenarios: <t> tapes, <r> runs, parity OK`` or ``check_scenarios: FAILED (<n>
problems)``.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any

import jsonschema
from jsonschema import exceptions as schema_errors

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIOS = REPO_ROOT / "scenarios"
DEFAULT_FACTS = REPO_ROOT / "site" / "data" / "facts.json"
SIM_CLI = REPO_ROOT / "tools" / "sim_cli.mjs"

JsRunner = Callable[[list[str]], str]
Choices = list[tuple[str, int]]


class JsUnavailableError(RuntimeError):
    """The JS simulator cannot be run (missing CLI, missing node, or a nonzero exit)."""


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


@dataclass
class Report:
    problems: list[Problem] = field(default_factory=list)
    tapes: int = 0
    runs: int = 0

    def error(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message))


def subprocess_js(argv: list[str]) -> str:
    """Run the JS CLI and return its stdout; any failure is JsUnavailableError."""
    try:
        done = subprocess.run(  # noqa: S603 - fixed argv, no shell
            argv, capture_output=True, text=True, check=False, cwd=REPO_ROOT
        )
    except OSError as exc:
        raise JsUnavailableError(f"cannot run {argv[0]}: {exc}") from exc
    if done.returncode != 0:
        detail = done.stderr.strip().splitlines()[-1:] or ["no output"]
        raise JsUnavailableError(f"exit {done.returncode}: {detail[0]}")
    return done.stdout


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def _rein_import() -> dict[str, ModuleType]:
    """The Rein modules, loaded from rein/src (the package is stdlib-only, not installed)."""
    src = str(REPO_ROOT / "rein" / "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    return {
        name: importlib.import_module(f"rein.{name}") for name in ("board", "pyjson", "sim", "tape")
    }


_KIND_CACHE: dict[str, jsonschema.protocols.Validator] = {}


def _kind_validator(
    trace_validator: jsonschema.protocols.Validator, kind: Any
) -> jsonschema.protocols.Validator | None:
    """A validator for one event kind only: much faster than trying every oneOf branch."""
    if not isinstance(kind, str):
        return None
    defs = trace_validator.schema.get("$defs", {})
    if kind not in defs:
        return None
    key = f"{id(trace_validator)}:{kind}"
    if key not in _KIND_CACHE:
        schema = {
            "$schema": trace_validator.schema.get("$schema"),
            "$defs": defs,
            "$ref": f"#/$defs/{kind}",
        }
        _KIND_CACHE[key] = type(trace_validator)(schema)
    return _KIND_CACHE[key]


def _validator(path: Path, report: Report) -> jsonschema.protocols.Validator | None:
    if not path.is_file():
        report.error(_display(path), 0, "schema file is missing")
        return None
    try:
        schema: Any = json.loads(path.read_text(encoding="utf-8"))
        validator_class = jsonschema.validators.validator_for(schema)
        validator_class.check_schema(schema)
    except (json.JSONDecodeError, schema_errors.SchemaError) as exc:
        report.error(_display(path), 0, f"schema is invalid: {exc}")
        return None
    return validator_class(schema)


def _schema_errors(
    validator: jsonschema.protocols.Validator, data: Any, where: str, report: Report
) -> None:
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        location = "/".join(str(part) for part in error.path) or "<root>"
        report.error(where, 0, f"schema: {error.message} (at {location})")


def _discover_tapes(scenarios_dir: Path) -> list[Path]:
    return sorted(p for p in scenarios_dir.glob("*.json") if not p.name.endswith("schema.json"))


def _board_files(scenarios_dir: Path) -> list[Path]:
    boards = scenarios_dir / "boards"
    return sorted(boards.glob("*.json")) if boards.is_dir() else []


def _find_board(board_id: str, scenarios_dir: Path) -> Path | None:
    candidate = scenarios_dir / "boards" / f"{board_id}.json"
    return candidate if candidate.is_file() else None


def _golden(scenarios_dir: Path, tape_id: str, board_id: str, seed: int, wire: bool) -> Path:
    """Events are golden in full (.jsonl); the wire is golden as its SHA-256 (.wire.sha256)."""
    suffix = ".wire.sha256" if wire else ".jsonl"
    return scenarios_dir / "golden" / f"{tape_id}.{board_id}.{seed}{suffix}"


def wire_digest(lines: list[str]) -> str:
    """The lowercase hex SHA-256 of the wire JSONL bytes (each line followed by a newline)."""
    return hashlib.sha256("".join(line + "\n" for line in lines).encode("utf-8")).hexdigest()


def _first_difference(
    where: str, python_lines: list[str], js_lines: list[str], report: Report
) -> bool:
    for index, (ours, theirs) in enumerate(zip(python_lines, js_lines, strict=False)):
        if ours != theirs:
            report.error(
                where,
                index + 1,
                f"python and js differ at line {index + 1}: python {ours!r} / js {theirs!r}",
            )
            return False
    if len(python_lines) != len(js_lines):
        report.error(
            where,
            min(len(python_lines), len(js_lines)) + 1,
            f"python has {len(python_lines)} lines, js has {len(js_lines)}",
        )
        return False
    return True


def _check_golden(path: Path, lines: list[str], report: Report, where: str) -> None:
    """Events: the golden file is the full JSONL output."""
    if not path.is_file():
        report.error(where, 0, f"golden file missing: {_display(path)} (run --update after parity)")
        return
    expected = path.read_text(encoding="utf-8").splitlines()
    if expected != lines:
        report.error(where, 0, f"golden file {_display(path)} differs from the python output")


def _check_golden_digest(path: Path, lines: list[str], report: Report, where: str) -> None:
    """Wire (A3.23): the golden file is one line, the SHA-256 of the wire JSONL bytes."""
    if not path.is_file():
        report.error(
            where, 0, f"golden digest missing: {_display(path)} (run --update after parity)"
        )
        return
    stored = path.read_text(encoding="utf-8").strip()
    if stored != wire_digest(lines):
        report.error(
            where, 0, f"golden wire digest {_display(path)} differs from the python output"
        )


def _python_run(
    rein: dict[str, ModuleType],
    tape_path: Path,
    board_path: Path,
    seed: int,
    facts: dict[str, Any] | None,
) -> tuple[list[str], list[str], list[str], list[dict[str, Any]], Choices]:
    """(event lines, wire lines, choice lines, event objects, choices) from the Python harness."""
    tape = rein["tape"].load_tape(tape_path)
    board = rein["board"].load_board(board_path)
    trial = rein["sim"].run_trial(tape, board, seed, facts)
    trace_line = rein["pyjson"].trace_line
    events = [trace_line(event) for event in trial.events]
    wire = [trace_line(item) for item in trial.wire]
    choices = list(trial.result.choices)
    choice_lines = [trace_line([location, index]) for location, index in choices]
    return events, wire, choice_lines, trial.events, choices


def _load_facts(path: Path, report: Report) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error(_display(path), exc.lineno, f"facts file is not valid JSON: {exc.msg}")
        return None
    return raw if isinstance(raw, dict) else None


def _load_and_validate(
    path: Path, validator: jsonschema.protocols.Validator | None, report: Report
) -> dict[str, Any] | None:
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report.error(_display(path), 0, f"not readable JSON: {exc}")
        return None
    if not isinstance(raw, dict):
        report.error(_display(path), 0, "must be a JSON object")
        return None
    if validator is not None:
        _schema_errors(validator, raw, _display(path), report)
    return raw


def _load_id(path: Path) -> str:
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return path.stem
    return str(raw.get("id", path.stem)) if isinstance(raw, dict) else path.stem


def _pointer_node(raw: Any, pointer: str) -> Any:
    node = raw
    for token in pointer.split("/")[1:]:
        node = node[int(token)] if isinstance(node, list) else node[token]
    return node


def _option_count(raw: dict[str, Any], location: str) -> int | None:
    """The number of options of the branch step at a JSON-pointer location, or None."""
    try:
        step = _pointer_node(raw, location)
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if isinstance(step, dict) and isinstance(step.get("branch"), list):
        return len(step["branch"])
    return None


def _branch_options(steps: list[Any], base: str) -> list[tuple[str, int]]:
    """Every (location, option) of every branch step in a script, at the locations the engine
    uses (A3.22)."""
    found: list[tuple[str, int]] = []
    for index, step in enumerate(steps):
        here = f"{base}/{index}"
        if not isinstance(step, dict):
            continue
        if isinstance(step.get("branch"), list):
            for option_index, option in enumerate(step["branch"]):
                found.append((here, option_index))
                found.extend(
                    _branch_options(
                        list(option.get("then", [])), f"{here}/branch/{option_index}/then"
                    )
                )
        elif isinstance(step.get("when"), list):
            for position, item in enumerate(step["when"]):
                key = "else" if "else" in item else "then"
                found.extend(
                    _branch_options(list(item.get(key, [])), f"{here}/when/{position}/{key}")
                )
        elif isinstance(step.get("repeat"), dict):
            found.extend(
                _branch_options(list(step["repeat"].get("steps", [])), f"{here}/repeat/steps")
            )
    return found


def _branch_coverage(
    tape_path: Path, raw: dict[str, Any], taken: dict[str, set[int]], report: Report
) -> None:
    """A3.22: every option of every reached branch step is taken by some golden run."""
    for location in sorted(taken):
        count = _option_count(raw, location)
        if count is None:
            report.error(_display(tape_path), 0, f"branch choice at {location} has no branch")
            continue
        for option in range(count):
            if option not in taken[location]:
                report.error(
                    _display(tape_path),
                    0,
                    f"branch coverage: option {option} of {location} is never taken "
                    "by any golden seed",
                )


COURSE_PATH = REPO_ROOT / "course.json"


def _failure_families(report: Report) -> dict[str, str] | None:
    """failure_families of course.json: family id -> wire (A4)."""
    try:
        course: Any = json.loads(COURSE_PATH.read_text(encoding="utf-8"))
        families = course["failure_families"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        report.error(_display(COURSE_PATH), 0, f"incident checks need course.json: {exc}")
        return None
    return {str(f["id"]): str(f["wire"]) for f in families}


def check_incident(
    tape_path: Path,
    data: dict[str, Any],
    scenarios_dir: Path,
    rein: dict[str, ModuleType],
    facts: dict[str, Any] | None,
    families: dict[str, str] | None,
    report: Report,
) -> None:
    """A4: every reference in a tape's incident block resolves (each problem names the tape)."""
    incident = data.get("incident")
    if not isinstance(incident, dict):
        return
    tape_id = str(data.get("id", tape_path.stem))
    where = _display(tape_path)

    def problem(message: str) -> None:
        report.error(where, 0, f"incident {tape_id}: {message}")

    family = str(incident.get("family", ""))
    if families is not None:
        if family not in families:
            problem(f"family {family!r} is not in course.json failure_families")
        elif families[family] != str(incident.get("wire", "")):
            problem(
                f"family {family!r} has wire {families[family]!r}, "
                f"but the incident says {incident.get('wire')!r}"
            )
    boards = [str(b) for b in data.get("boards", [])]
    board_id = str(incident.get("board", ""))
    if board_id not in boards:
        problem(f"board {board_id!r} is not one of the tape's boards {boards}")
    seed = incident.get("seed")
    seeds = [int(s) for s in data.get("golden_seeds", [])]
    if seed not in seeds:
        problem(f"seed {seed!r} is not one of the golden_seeds {seeds}")
    fixes = incident.get("fixes", [])
    correct = incident.get("correct_fix")
    if (
        not isinstance(fixes, list)
        or not isinstance(correct, int)
        or not (0 <= correct < len(fixes))
    ):
        problem(f"correct_fix {correct!r} is not an index into the {len(fixes)} fixes")
    if board_id not in boards or seed not in seeds:
        return
    board_path = _find_board(board_id, scenarios_dir)
    if board_path is None:
        problem(f"board file for {board_id!r} is missing")
        return
    try:
        trial = rein["sim"].run_trial(
            rein["tape"].load_tape(tape_path),
            rein["board"].load_board(board_path),
            int(seed),
            facts,
        )
    except (ValueError, OSError, KeyError, RuntimeError) as exc:
        problem(f"the trace of {board_id} seed {seed} could not be produced: {exc}")
        return
    count = len(trial.events)
    referenced = [("first_bad_seq", incident.get("first_bad_seq"))]
    referenced += [("accept_seqs", seq) for seq in incident.get("accept_seqs", [])]
    referenced += [
        ("notes.seq", note.get("seq"))
        for note in incident.get("notes", [])
        if isinstance(note, dict)
    ]
    for name, seq in referenced:
        if not isinstance(seq, int) or not 0 <= seq < count:
            problem(
                f"{name} {seq!r} does not exist in the trace of {board_id} seed {seed} "
                f"({count} events)"
            )


def check(
    scenarios_dir: Path,
    *,
    js: JsRunner | None = None,
    facts_path: Path = DEFAULT_FACTS,
    tapes: list[Path] | None = None,
    update: str | None = None,
) -> Report:
    """Validate and compare every tape (or the given ones). ``js`` runs the JS CLI argv."""
    report = Report()
    runner: JsRunner = js if js is not None else subprocess_js
    tape_validator = _validator(scenarios_dir / "schema.json", report)
    board_validator = _validator(scenarios_dir / "board.schema.json", report)
    trace_validator = _validator(scenarios_dir / "trace.schema.json", report)
    for board_file in _board_files(scenarios_dir):
        if board_validator is not None:
            _load_and_validate(board_file, board_validator, report)
    rein = _rein_import()
    facts = _load_facts(facts_path, report)
    targets = tapes if tapes is not None else _discover_tapes(scenarios_dir)
    families = _failure_families(report)
    js_missing = False
    for tape_path in targets:
        data = _load_and_validate(tape_path, tape_validator, report)
        if data is None:
            continue
        tape_id = str(data.get("id"))
        if tape_id != tape_path.stem:
            report.error(_display(tape_path), 0, f"tape id {tape_id!r} must equal the file stem")
        if update is not None and update not in (tape_id, tape_path.stem):
            continue
        report.tapes += 1
        check_incident(tape_path, data, scenarios_dir, rein, facts, families, report)
        taken: dict[str, set[int]] = {}
        for board_id in data.get("boards", []):
            board_path = _find_board(str(board_id), scenarios_dir)
            if board_path is None:
                report.error(_display(tape_path), 0, f"board {board_id!r} not found")
                continue
            for seed in data.get("golden_seeds", []):
                report.runs += 1
                js_missing, choices = _check_run(
                    rein,
                    runner,
                    tape_path,
                    board_path,
                    str(board_id),
                    int(seed),
                    facts,
                    facts_path,
                    scenarios_dir,
                    trace_validator,
                    report,
                    update,
                    js_missing,
                )
                for location, index in choices:
                    taken.setdefault(location, set()).add(index)
        _branch_coverage(tape_path, data, taken, report)
    if update is not None and not any(update in (_load_id(p), p.stem) for p in targets):
        report.error(update, 0, "no tape with that id to update")
    if js_missing:
        report.error(_display(SIM_CLI), 0, "js simulator unavailable; parity not checked")
    return report


def _check_run(
    rein: dict[str, ModuleType],
    runner: JsRunner,
    tape_path: Path,
    board_path: Path,
    board_id: str,
    seed: int,
    facts: dict[str, Any] | None,
    facts_path: Path,
    scenarios_dir: Path,
    trace_validator: jsonschema.protocols.Validator | None,
    report: Report,
    update: str | None,
    js_missing: bool,
) -> tuple[bool, Choices]:
    """Compare one run. Returns (js_missing, the python choices)."""
    tape_id = tape_path.stem
    where = f"{_display(tape_path)}:{board_id}:{seed}"
    try:
        events, wire, choice_lines, event_objects, choices = _python_run(
            rein, tape_path, board_path, seed, facts
        )
    except (ValueError, OSError, KeyError, RuntimeError) as exc:
        report.error(where, 0, f"python harness failed: {exc}")
        return js_missing, []
    if trace_validator is not None:
        for index, event in enumerate(event_objects):
            kind_validator = _kind_validator(trace_validator, event.get("kind"))
            if kind_validator is None:
                report.error(where, index + 1, f"event schema: unknown kind {event.get('kind')!r}")
                continue
            for error in list(kind_validator.iter_errors(event))[:3]:
                report.error(where, index + 1, f"event schema: {error.message}")
    if js_missing:
        return js_missing, choices
    js_argv = [
        "node",
        str(SIM_CLI),
        "run",
        "--tape",
        str(tape_path),
        "--board",
        str(board_path),
        "--seed",
        str(seed),
        "--facts",
        str(facts_path),
    ]
    try:
        js_events = runner(js_argv).splitlines()
        js_wire = runner([*js_argv, "--wire"]).splitlines()
    except JsUnavailableError as exc:
        report.error(where, 0, f"js simulator failed: {exc}")
        return True, choices
    events_ok = _first_difference(where, events, js_events, report)
    wire_ok = _first_difference(where + " (wire)", wire, js_wire, report)
    try:
        js_choices = runner([*js_argv, "--choices"]).splitlines()
    except JsUnavailableError as exc:
        report.error(where, 0, f"js simulator failed on --choices: {exc}")
    else:
        _first_difference(where + " (choices)", choice_lines, js_choices, report)
    if update is not None:
        if events_ok and wire_ok:
            _write_golden(scenarios_dir, tape_id, board_id, seed, events, wire)
        else:
            report.error(where, 0, "golden update refused: python and js do not match")
        return js_missing, choices
    _check_golden(_golden(scenarios_dir, tape_id, board_id, seed, False), events, report, where)
    _check_golden_digest(_golden(scenarios_dir, tape_id, board_id, seed, True), wire, report, where)
    return js_missing, choices


def _write_golden(
    scenarios_dir: Path, tape_id: str, board_id: str, seed: int, events: list[str], wire: list[str]
) -> None:
    golden_dir = scenarios_dir / "golden"
    golden_dir.mkdir(parents=True, exist_ok=True)
    _golden(scenarios_dir, tape_id, board_id, seed, False).write_text(
        "".join(line + "\n" for line in events), encoding="utf-8"
    )
    _golden(scenarios_dir, tape_id, board_id, seed, True).write_text(
        wire_digest(wire) + "\n", encoding="utf-8"
    )


def suggest_seeds(scenarios_dir: Path, n: int, facts_path: Path = DEFAULT_FACTS) -> list[str]:
    """A3.22 --suggest-seeds: per tape, a small seed set among 0..n-1 covering every reachable
    branch option across the tape's boards (greedy set cover). Print only."""
    rein = _rein_import()
    facts = _load_facts(facts_path, Report())
    lines: list[str] = []
    for tape_path in _discover_tapes(scenarios_dir):
        tape = rein["tape"].load_tape(tape_path)
        boards = []
        for board_id in tape.boards:
            board_path = _find_board(board_id, scenarios_dir)
            if board_path is not None:
                boards.append(rein["board"].load_board(board_path))
        per_seed: dict[int, set[tuple[str, int]]] = {}
        for seed in range(n):
            covered: set[tuple[str, int]] = set()
            for board in boards:
                trial = rein["sim"].run_trial(tape, board, seed, facts)
                covered.update((location, index) for location, index in trial.result.choices)
            per_seed[seed] = covered
        reachable: set[tuple[str, int]] = set().union(*per_seed.values()) if per_seed else set()
        remaining = set(reachable)
        chosen: list[int] = []
        while remaining:
            best = max(range(n), key=lambda s: (len(per_seed[s] & remaining), -s))
            gain = per_seed[best] & remaining
            if not gain:
                break
            chosen.append(best)
            remaining -= gain
        chosen.sort()
        static = set(_branch_options(list(tape.raw.get("script", [])), "/script"))
        covered_count = len(reachable) - len(remaining)
        if not reachable:
            lines.append(f"{_display(tape_path)}: no branch options reached (any golden_seeds)")
        else:
            lines.append(
                f"{_display(tape_path)}: golden_seeds {json.dumps(chosen)} "
                f"covers {covered_count} of {len(reachable)} reachable branch options"
            )
        for location, index in sorted(static - reachable):
            lines.append(f"  not reached by seeds 0..{n - 1}: {location} option {index}")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check scenario tapes and Rein parity.")
    parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    parser.add_argument("--facts", type=Path, default=DEFAULT_FACTS)
    parser.add_argument(
        "--update",
        metavar="TAPE",
        default=None,
        help="rewrite golden files for TAPE from Python, if JS matches",
    )
    parser.add_argument(
        "--suggest-seeds",
        metavar="N",
        type=int,
        default=None,
        help="print a seed set among 0..N-1 that covers every reachable branch option",
    )
    args = parser.parse_args(argv)
    if args.suggest_seeds is not None:
        for line in suggest_seeds(args.scenarios, args.suggest_seeds, args.facts):
            print(line)
        return 0
    report = check(args.scenarios, facts_path=args.facts, update=args.update)
    for problem in report.problems:
        print(problem.render())
    if report.problems:
        print(f"check_scenarios: FAILED ({len(report.problems)} problems)")
        return 1
    print(f"check_scenarios: {report.tapes} tapes, {report.runs} runs, parity OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
