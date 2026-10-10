from kata import check


def test_a_matching_value_has_no_errors():
    schema = {"type": "object", "properties": {"n": {"type": "integer"}}, "required": ["n"]}
    assert check({"n": 3}, schema) == [], "a value that matches the schema has no errors"


def test_nested_fields_report_their_path():
    schema = {"type": "object", "properties": {"user": {"type": "object", "properties": {
        "name": {"type": "string"}}}}}
    assert check({"user": {"name": 3}}, schema) == ["$.user.name: expected string"], (
        "the path names the field two levels down"
    )


def test_each_array_item_is_checked():
    schema = {"type": "array", "items": {"type": "integer"}}
    assert check([1, "x", 3], schema) == ["$[1]: expected integer"], "each item has its own path"


def test_enum_lists_the_allowed_values():
    schema = {"type": "string", "enum": ["end_turn", "tool_use"]}
    errors = check("stop", schema)
    assert len(errors) == 1, "one error for one bad value"
    assert "end_turn" in errors[0] and "tool_use" in errors[0], "the error lists the allowed values"


def test_a_missing_required_field_is_named():
    schema = {"type": "object", "required": ["path"]}
    assert check({}, schema) == ["$: missing required field 'path'"], "say which field is missing"


def test_no_required_list_means_nothing_is_required():
    schema = {"type": "object", "properties": {"a": {"type": "integer"}}}
    assert check({}, schema) == [], "without a required list, no field is required"


def test_additional_properties_false_rejects_extra_fields():
    schema = {"type": "object", "properties": {"a": {"type": "integer"}}, "additionalProperties": False}
    assert check({"a": 1, "b": 2}, schema) == ["$: unexpected field 'b'"], "b is not in the schema"


def test_extra_fields_are_allowed_by_default():
    schema = {"type": "object", "properties": {"a": {"type": "integer"}}}
    assert check({"a": 1, "b": 2}, schema) == [], "extra fields pass unless additionalProperties is False"


def test_a_boolean_is_not_an_integer():
    assert check(True, {"type": "integer"}) == ["$: expected integer"], "True is a JSON boolean, not 1"
