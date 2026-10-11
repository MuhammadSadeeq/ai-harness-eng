from kata import decide

RULES = [
    {"decision": "deny", "tool": "delete_path", "prefix": "../", "reason": "outside the workspace"},
    {"decision": "ask", "tool": "edit_file", "prefix": "", "reason": "edits need a look"},
    {"decision": "allow", "tool": "read_file", "prefix": "", "reason": "read-only"},
    {"decision": "allow", "tool": "edit_file", "prefix": "docs/", "reason": "docs are safe"},
    {"decision": "ask", "tool": "delete_path", "prefix": "", "reason": "deletes need a look"},
]

CASES = [
    ({"tool": "delete_path", "input": {"path": "../data"}}, "allow", "deny"),
    ({"tool": "delete_path", "input": {"path": "build/"}}, "allow", "ask"),
    ({"tool": "edit_file", "input": {"path": "docs/readme.md"}}, "deny", "ask"),
    ({"tool": "edit_file", "input": {}}, "allow", "ask"),
    ({"tool": "read_file", "input": {"path": "calc.py"}}, "ask", "allow"),
    ({"tool": "run_command", "input": {"cmd": "ls"}}, "ask", "ask"),
    ({"tool": "run_command", "input": {"cmd": "ls"}}, "deny", "deny"),
    ({"tool": "delete_path", "input": {}}, "allow", "ask"),
]


def test_the_decision_order_holds_across_the_table():
    for call, mode, expected in CASES:
        got = decide(call, RULES, mode)["decision"]
        assert got == expected, f"{call} under mode {mode}: expected {expected}, got {got}"


def test_a_deny_rule_beats_an_allow_mode():
    result = decide({"tool": "delete_path", "input": {"path": "../data"}}, RULES, "allow")
    assert result == {"decision": "deny", "reason": "outside the workspace"}, "the deny wins and carries its reason"


def test_an_ask_rule_shadows_a_later_allow_rule():
    result = decide({"tool": "edit_file", "input": {"path": "docs/readme.md"}}, RULES, "deny")
    assert result["decision"] == "ask", "the ask group is checked before the allow group"


def test_the_mode_default_has_its_own_reason():
    result = decide({"tool": "run_command", "input": {"cmd": "ls"}}, RULES, "ask")
    assert result == {"decision": "ask", "reason": "the mode default"}, "no rule matches, so the mode decides"


def test_list_order_does_not_decide():
    rules = [
        {"decision": "allow", "tool": "edit_file", "prefix": "", "reason": "edits are fine"},
        {"decision": "deny", "tool": "edit_file", "prefix": "tests/", "reason": "tests are off limits"},
    ]
    result = decide({"tool": "edit_file", "input": {"path": "tests/t.py"}}, rules, "allow")
    assert result == {"decision": "deny", "reason": "tests are off limits"}, "the deny group is checked first, whatever the list order"


def test_a_prefix_must_be_at_the_start_of_the_path():
    rules = [{"decision": "deny", "tool": "edit_file", "prefix": "tests/", "reason": "no"}]
    assert decide({"tool": "edit_file", "input": {"path": "src/tests/t.py"}}, rules, "allow")["decision"] == "allow"
