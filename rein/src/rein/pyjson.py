"""Canonical JSON (ENGINE.md sections 1, 2 and 10).

``pyjson`` is exactly ``json.dumps`` with its defaults. The engine uses integers only, so
floats are rejected here instead of being written in a form the JS twin would not match.
"""

from __future__ import annotations

import json
from typing import Any


def pyjson(value: Any) -> str:
    """Return ``json.dumps(value)`` with the defaults; floats and tuples are errors."""
    _check(value, "$")
    return json.dumps(value)


def trace_line(value: Any) -> str:
    """One JSONL line: sorted keys, compact separators (ENGINE section 10)."""
    _check(value, "$")
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _check(value: Any, where: str) -> None:
    if value is None or isinstance(value, bool | int | str):
        return
    if isinstance(value, float):
        raise ValueError(f"float at {where}: the engine uses integers only")
    if isinstance(value, list):
        for index, item in enumerate(value):
            _check(item, f"{where}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"non-string key at {where}")
            _check(item, f"{where}.{key}")
        return
    raise ValueError(f"unsupported type {type(value).__name__} at {where}")
