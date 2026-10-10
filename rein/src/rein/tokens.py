"""Token estimate: floor(len(pyjson(x)) / 4), the book's rule (ENGINE.md section 4, D-039)."""

from __future__ import annotations

from typing import Any

from .pyjson import pyjson


def tokens(value: Any) -> int:
    return len(pyjson(value)) // 4
