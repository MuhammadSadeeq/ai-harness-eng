"""Strict reading of tapes and boards: integers only, ASCII only, no numeric-string keys.

ENGINE.md section 1 rules 1 to 3. JS parses numbers and orders keys differently from Python,
so anything outside these rules is rejected before a run starts.
"""

from __future__ import annotations

import json
from typing import Any

from .spec import ASCII_PATTERN, CANONICAL_INDEX


class PlainError(ValueError):
    """Input that the engine's determinism rules forbid."""


def _no_float(text: str) -> Any:
    raise PlainError(f"float {text} is not allowed: the engine uses integers only")


def _no_constant(text: str) -> Any:
    raise PlainError(f"{text} is not allowed: the engine uses integers only")


def loads_strict(text: str) -> Any:
    """Parse JSON, rejecting floats (even 1.0) and NaN or Infinity, then check every value."""
    value: Any = json.loads(text, parse_float=_no_float, parse_constant=_no_constant)
    check_plain(value, "$")
    return value


def check_plain(value: Any, where: str) -> None:
    """Every string is ASCII; keys are never canonical integers; no floats."""
    if value is None or isinstance(value, bool | int):
        return
    if isinstance(value, str):
        if ASCII_PATTERN.fullmatch(value) is None:
            raise PlainError(f"non-ASCII or control text at {where}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            check_plain(item, f"{where}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or ASCII_PATTERN.fullmatch(key) is None:
                raise PlainError(f"non-ASCII key at {where}")
            if CANONICAL_INDEX.fullmatch(key) is not None:
                raise PlainError(f"numeric-string key {key!r} at {where} (JS reorders these)")
            check_plain(item, f"{where}.{key}")
        return
    raise PlainError(f"unsupported value at {where}: {type(value).__name__}")
