from kata import check_call

RULES = [{"decision": "deny", "tool": "edit_file", "prefix": "tests/", "reason": "tests are off limits"}]


def test_edit_under_the_protected_prefix_is_denied():
    result = check_call({"tool": "edit_file", "input": {"path": "tests/test_calc.py"}}, RULES)
    assert result["decision"] == "deny", "an edit under tests/ must be denied"
    assert result["reason"] == "tests are off limits", "the deny carries the rule's reason"


def test_an_edit_elsewhere_is_allowed():
    result = check_call({"tool": "edit_file", "input": {"path": "calc.py"}}, RULES)
    assert result["decision"] == "allow", "an edit outside the protected prefix is allowed"


def test_another_tool_on_the_same_path_is_allowed():
    result = check_call({"tool": "read_file", "input": {"path": "tests/test_calc.py"}}, RULES)
    assert result["decision"] == "allow", "the rule is for edit_file only"


def test_a_call_with_no_path_is_denied_not_raised():
    result = check_call({"tool": "edit_file", "input": {}}, RULES)
    assert result["decision"] == "deny", "a call that cannot be checked fails closed"


def test_a_malformed_call_is_denied_not_raised():
    assert check_call("edit_file", RULES)["decision"] == "deny", "a call that is not a dict fails closed"
    assert check_call({"tool": "edit_file", "input": "tests/x.py"}, RULES)["decision"] == "deny", "input must be a dict"


def test_deny_is_checked_before_any_allow():
    rules = [
        {"decision": "allow", "tool": "edit_file", "prefix": "", "reason": "edits are fine"},
        {"decision": "deny", "tool": "edit_file", "prefix": "tests/", "reason": "tests are off limits"},
    ]
    assert check_call({"tool": "edit_file", "input": {"path": "tests/x.py"}}, rules)["decision"] == "deny"
