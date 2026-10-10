from kata import check_value

WRITE = {
    "properties": {
        "path": {"type": "string"},
        "content": {"type": "string"},
        "mode": {"type": "string", "enum": ["replace", "append"]},
    },
    "required": ["path", "content"],
    "additionalProperties": False,
}


def test_a_valid_input_gives_empty_reason():
    assert check_value(WRITE, {"path": "a.txt", "content": "hi"}) == "", "a valid input has no reason"


def test_a_non_object_is_refused_first():
    assert check_value(WRITE, "a.txt") == "input must be an object", "the shape check comes first"


def test_a_missing_required_field_is_named_in_schema_order():
    assert check_value(WRITE, {}) == "missing required field: path", "path is first in required"
    assert check_value(WRITE, {"path": "a.txt"}) == "missing required field: content", "then content"


def test_required_is_checked_before_unknown_fields():
    assert check_value(WRITE, {"text": "x"}) == "missing required field: path", \
        "a missing required field wins over an unknown field"


def test_an_unknown_field_is_refused_when_additional_properties_is_false():
    value = {"path": "a.txt", "content": "hi", "text": "x"}
    assert check_value(WRITE, value) == "unknown field: text", "text is not in properties"


def test_unknown_fields_are_allowed_without_additional_properties_false():
    loose = {"properties": {"a": {"type": "string"}}, "required": ["a"]}
    assert check_value(loose, {"a": "x", "b": 1}) == "", "without the rule, extra fields are fine"


def test_a_wrong_type_is_named():
    assert check_value(WRITE, {"path": "a.txt", "content": 5}) == "field content must be string", "5 is not a string"


def test_a_json_boolean_is_not_an_integer_but_an_integer_is_a_number():
    flag = {"properties": {"n": {"type": "integer"}, "x": {"type": "number"}}}
    assert check_value(flag, {"n": True}) == "field n must be integer", "True is not an integer"
    assert check_value(flag, {"x": 3}) == "", "an integer is a number"


def test_an_enum_names_the_allowed_values_as_json():
    assert check_value(WRITE, {"path": "a", "content": "b", "mode": "cut"}) == \
        'field mode must be one of: "replace", "append"', "the enum message uses json.dumps for each value"


def test_the_first_failure_wins_in_field_order():
    value = {"path": 1, "content": 2}
    assert check_value(WRITE, value) == "field path must be string", "the first key in the input is reported"
