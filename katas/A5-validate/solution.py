import json


TYPES = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "array": lambda v: isinstance(v, list),
    "object": lambda v: isinstance(v, dict),
}


def check_value(schema, value):
    """Check one input against a small JSON-like schema. Return "" when it is valid, else the first reason.

    schema is a dict with optional "properties" (name -> {"type": ..., "enum": [...]}), "required" (a list of
    names) and "additionalProperties" (False means a field the schema does not name is refused).
    Types: "string", "integer", "number", "boolean", "array", "object". A JSON boolean is not an integer;
    "number" accepts integers.

    Check in this order, and return the first failure:
      1. value is not a dict: "input must be an object"
      2. each name in "required", in schema order, missing: "missing required field: <name>"
      3. each key of value, in its order:
         - additionalProperties is False and the key is not in "properties": "unknown field: <key>"
         - the key has a "type" and the value does not match it: "field <key> must be <type>"
         - the key has "enum" and the value is not in it:
           "field <key> must be one of: " followed by the enum values, each as json.dumps, joined with ", "
    """
    if not isinstance(value, dict):
        return "input must be an object"
    properties = schema.get("properties", {})
    for name in schema.get("required", []):
        if name not in value:
            return f"missing required field: {name}"
    for key, item in value.items():
        if schema.get("additionalProperties") is False and key not in properties:
            return f"unknown field: {key}"
        spec = properties.get(key, {})
        if "type" in spec and not TYPES[spec["type"]](item):
            return f"field {key} must be {spec['type']}"
        if "enum" in spec and item not in spec["enum"]:
            return f"field {key} must be one of: " + ", ".join(json.dumps(v) for v in spec["enum"])
    return ""
