from typing import Any

TYPES: dict[str, Any] = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "number": (int, float),
    "integer": int,
}


def check(value: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    """Return the errors of value against schema, each as '<path>: <what is wrong>'."""
    kind = schema.get("type")
    if kind is not None and not _has_type(value, kind):
        return [f"{path}: expected {kind}"]
    errors: list[str] = []
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {schema['enum']}")
    if kind == "object":
        errors.extend(_check_object(value, schema, path))
    if kind == "array" and "items" in schema:
        for index, item in enumerate(value):
            errors.extend(check(item, schema["items"], f"{path}[{index}]"))
    return errors


def _has_type(value: Any, kind: str) -> bool:
    if isinstance(value, bool) and kind in ("integer", "number"):
        return False  # a JSON boolean is not a number, though Python makes bool an int
    return isinstance(value, TYPES[kind])


def _check_object(value: dict[str, Any], schema: dict[str, Any], path: str) -> list[str]:
    errors: list[str] = []
    properties = schema.get("properties", {})
    for name in schema.get("required", []):
        if name not in value:
            errors.append(f"{path}: missing required field {name!r}")
    for name, sub in properties.items():
        if name in value:
            errors.extend(check(value[name], sub, f"{path}.{name}"))
    if schema.get("additionalProperties") is False:
        for name in value:
            if name not in properties:
                errors.append(f"{path}: unexpected field {name!r}")
    return errors
