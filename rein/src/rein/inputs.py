"""Input checks (ENGINE.md A7.1): the course's subset of JSON Schema.

The first failure wins, in the order the amendment gives: the input is not an object; then each
required name in schema order; then each input field in input order (unknown field, declared type,
enum). The reason text is the one the amendment fixes.
"""

from __future__ import annotations

from typing import Any

from .pyjson import pyjson


def check_input(value: Any, schema: dict[str, Any]) -> str:
    """The reason the input is invalid, or "" when it is valid."""
    if not isinstance(value, dict):
        return "input must be an object"
    for name in schema.get("required", []):
        if name not in value:
            return f"missing required field: {name}"
    properties: dict[str, Any] = schema.get("properties", {})
    closed = schema.get("additionalProperties") is False
    for name, item in value.items():
        if name not in properties:
            if closed:
                return f"unknown field: {name}"
            continue
        declared: dict[str, Any] = properties[name]
        kind = declared.get("type")
        if kind is not None and not _is_type(item, str(kind)):
            return f"field {name} must be {kind}"
        if "enum" in declared:
            allowed = [pyjson(option) for option in declared["enum"]]
            if pyjson(item) not in allowed:
                return f"field {name} must be one of: " + ", ".join(allowed)
    return ""


def _is_type(value: Any, kind: str) -> bool:
    if kind == "string":
        return isinstance(value, str)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, int | float) and not isinstance(value, bool)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "array":
        return isinstance(value, list)
    if kind == "object":
        return isinstance(value, dict)
    return True  # a type the subset does not know is not checked
