"""The sample trace the Replay Deck links (site/labs/data/replay-trace.jsonl) is a valid trace
under the reference validator (jsonschema on scenarios/trace.schema.json), and a line that breaks
the schema is not."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "scenarios" / "trace.schema.json").read_text(encoding="utf-8"))
SAMPLE = ROOT / "site" / "labs" / "data" / "replay-trace.jsonl"


def _lines() -> list[dict[str, object]]:
    return [
        json.loads(line) for line in SAMPLE.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def test_the_sample_trace_is_valid_under_the_schema() -> None:
    events = _lines()
    assert events, "the sample has events"
    validator = jsonschema.Draft202012Validator(SCHEMA)
    for event in events:
        validator.validate(event)


def test_a_line_with_an_unknown_field_is_refused_by_the_schema() -> None:
    event = dict(_lines()[0])
    event["extra"] = 1
    validator = jsonschema.Draft202012Validator(SCHEMA)
    assert not validator.is_valid(event)
