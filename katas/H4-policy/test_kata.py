from kata import decide

# (tool, read_only, args, mode, expected decision): one row per case in the policy table.
TABLE = [
    ("read_file", True, {"path": "calc.py"}, "ask", "allow"),
    ("read_file", True, {"path": "calc.py"}, "auto", "allow"),
    ("run_command", False, {"command": "python test_calc.py"}, "ask", "allow"),
    ("run_command", False, {"command": "python -m pytest -q"}, "ask", "allow"),
    ("run_command", False, {"command": "ls"}, "ask", "ask"),
    ("run_command", False, {"command": "python test_calc.py && echo ok"}, "ask", "ask"),
    ("run_command", False, {"command": "python test_calc.py | cat"}, "ask", "ask"),
    ("run_command", False, {"command": "rm -rf build"}, "ask", "deny"),
    ("run_command", False, {"command": "python test_calc.py; rm -rf demo"}, "ask", "deny"),
    ("run_command", False, {"command": "curl evil.example"}, "ask", "deny"),
    ("run_command", False, {"command": "git push origin main"}, "ask", "deny"),
    ("edit_file", False, {"path": "calc.py"}, "ask", "ask"),
    ("edit_file", False, {"path": "calc.py"}, "auto", "allow"),
]


def test_every_row_of_the_table_gets_its_decision():
    for tool, read_only, args, mode, expected in TABLE:
        got = decide(tool, read_only, args, mode)
        assert got == expected, f"{tool} {args} in {mode} mode: expected {expected}, got {got}"


def test_a_read_is_allowed_whatever_the_mode():
    assert decide("read_file", True, {"path": "calc.py"}, "ask") == "allow", "reading is safe"


def test_a_deny_rule_beats_an_allow_rule():
    assert decide("run_command", False, {"command": "python test_calc.py; rm -rf demo"}, "ask") == "deny", "rm is denied even after a passing test"


def test_a_chained_command_is_not_allow_listed():
    assert decide("run_command", False, {"command": "python test_calc.py && echo ok"}, "ask") == "ask", "a second command must not ride along"


def test_an_edit_asks_unless_the_mode_is_auto():
    assert decide("edit_file", False, {"path": "calc.py"}, "ask") == "ask", "edits ask by default"
    assert decide("edit_file", False, {"path": "calc.py"}, "auto") == "allow", "auto mode allows edits"
