"""The trace schema as a whole (scenarios/trace.schema.json): check_scenarios validates each
event against its own kind's definition, so these tests keep the oneOf usable for readers
that validate whole traces (a learner's trace in the Replay Deck, BP-4.0)."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

SCENARIOS = Path(__file__).resolve().parents[2] / "scenarios"


def _schema() -> dict[str, object]:
    data = json.loads((SCENARIOS / "trace.schema.json").read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def test_one_of_names_each_kind_once() -> None:
    schema = _schema()
    refs = [branch["$ref"] for branch in schema["oneOf"]]  # type: ignore[attr-defined]
    assert len(refs) == len(set(refs)), "a kind listed twice makes its events match two branches"
    defs = schema["$defs"]
    assert isinstance(defs, dict)
    assert sorted(ref.rsplit("/", 1)[-1] for ref in refs) == sorted(defs)


def test_one_event_of_each_golden_kind_is_valid_against_the_whole_schema() -> None:
    validator = jsonschema.Draft202012Validator(_schema())
    sample: dict[str, dict[str, object]] = {}
    for path in sorted(SCENARIOS.glob("golden/**/*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            event = json.loads(line)
            sample.setdefault(event["kind"], event)
    assert sample, "no golden traces found"
    for kind, event in sorted(sample.items()):
        errors = [e.message[:120] for e in validator.iter_errors(event)]
        assert not errors, f"{kind}: {errors[0]}"
