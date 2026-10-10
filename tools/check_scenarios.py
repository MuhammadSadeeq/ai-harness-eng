"""check_scenarios: checks the scenario tapes (guarded stub; parity arrives in Phase 1).

Every ``scenarios/*.json`` (except schema.json) must be a JSON object whose ``id`` equals its
file stem. If ``scenarios/schema.json`` exists, the schema itself and every tape are validated
with jsonschema. With no tapes the check passes. With any tape it fails after the schema checks,
because the parity check (golden traces in JS and Rein) is not built yet.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# jsonschema ships no type stubs and types-jsonschema is not in DECISIONS D-018 (see doubts).
import jsonschema  # type: ignore[import-untyped]
from jsonschema import exceptions as schema_errors

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIOS = REPO_ROOT / "scenarios"
SCHEMA_NAME = "schema.json"


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

    def error(self, path: Path, line: int, message: str) -> None:
        self.problems.append(Problem(_display(path), line, message))


def run(scenarios_dir: Path) -> Report:
    report = Report()
    validator = _load_schema(scenarios_dir / SCHEMA_NAME, report)
    tapes = (
        sorted(p for p in scenarios_dir.glob("*.json") if p.name != SCHEMA_NAME)
        if scenarios_dir.is_dir()
        else []
    )
    report.tapes = len(tapes)
    for tape in tapes:
        _check_tape(tape, validator, report)
    if tapes:
        report.error(scenarios_dir, 0, "parity not implemented (Phase 1)")
    return report


def _load_schema(path: Path, report: Report) -> jsonschema.protocols.Validator | None:
    if not path.is_file():
        return None
    try:
        schema: Any = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error(path, exc.lineno, f"schema is not valid JSON: {exc.msg}")
        return None
    if not isinstance(schema, dict):
        report.error(path, 0, "schema must be a JSON object")
        return None
    validator_class = jsonschema.validators.validator_for(schema)
    try:
        validator_class.check_schema(schema)
    except schema_errors.SchemaError as exc:
        report.error(path, 0, f"schema is invalid: {exc.message}")
        return None
    return validator_class(schema)


def _check_tape(
    tape: Path, validator: jsonschema.protocols.Validator | None, report: Report
) -> None:
    try:
        data: Any = json.loads(tape.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error(tape, exc.lineno, f"tape is not valid JSON: {exc.msg}")
        return
    if not isinstance(data, dict):
        report.error(tape, 0, "tape must be a JSON object")
        return
    if data.get("id") != tape.stem:
        report.error(tape, 0, f"tape id {data.get('id')!r} must equal the file stem {tape.stem!r}")
    if validator is None:
        return
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        location = "/".join(str(part) for part in error.path) or "<root>"
        report.error(tape, 0, f"schema: {error.message} (at {location})")


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Guarded stub: check the scenario tapes.")
    parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    args = parser.parse_args(argv)
    report = run(args.scenarios)
    for problem in report.problems:
        print(problem.render())
    if report.problems:
        print(f"check_scenarios: FAILED ({len(report.problems)} problems)")
        return 1
    print(f"check_scenarios: {report.tapes} tapes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
