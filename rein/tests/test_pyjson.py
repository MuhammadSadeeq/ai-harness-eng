"""pyjson against the 20 shared fixtures, and the trace line form (ENGINE.md sections 2 and 10)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from support import SCENARIOS

from rein.pyjson import pyjson, trace_line

CASES: list[dict[str, Any]] = json.loads(
    (SCENARIOS / "fixtures" / "pyjson.json").read_text(encoding="utf-8")
)["cases"]


def test_fixture_has_twenty_cases() -> None:
    assert len(CASES) == 20


@pytest.mark.parametrize("case", CASES, ids=[str(i) for i in range(len(CASES))])
def test_matches_fixture(case: dict[str, Any]) -> None:
    assert pyjson(case["value"]) == case["expected"]


def test_floats_are_rejected() -> None:
    with pytest.raises(ValueError, match="float"):
        pyjson({"n": 1.5})
    with pytest.raises(ValueError, match="float"):
        pyjson([1.0])


def test_tuples_and_non_string_keys_are_rejected() -> None:
    with pytest.raises(ValueError):
        pyjson((1, 2))
    with pytest.raises(ValueError, match="non-string key"):
        pyjson({1: "x"})


def test_trace_line_is_sorted_and_compact() -> None:
    assert trace_line({"b": 1, "a": [True, None], "c": {"z": 0, "y": "q"}}) == (
        '{"a":[true,null],"b":1,"c":{"y":"q","z":0}}'
    )
