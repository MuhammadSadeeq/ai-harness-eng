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
    raise NotImplementedError("check the value in the order the docstring gives")
