from kata import defined_names, stale_references

CODE = "def render_report(rows):\n    return ''\n\nclass Table:\n    def add(self):\n        pass\n"


def test_defined_names_lists_functions_and_classes_at_any_depth():
    names = defined_names(CODE)
    assert "render_report" in names, "a top-level function is a definition"
    assert "Table" in names, "a class is a definition"
    assert "add" in names, "a method is a definition too, at any depth"
    assert "rows" not in names, "a parameter is not a definition"


def test_a_name_in_a_comment_is_not_a_definition():
    assert "ghost" not in defined_names("# def ghost(): pass\nx = 1\n"), "a comment is not code"


def test_a_call_to_a_missing_function_is_stale():
    rules = "Build the summary with format_report() in report.py."
    assert stale_references(rules, defined_names(CODE)) == [(1, "format_report")], "format_report is not defined"


def test_a_call_to_a_present_function_is_not_stale():
    rules = "Build the summary with render_report() in report.py."
    assert stale_references(rules, defined_names(CODE)) == [], "render_report is defined, so nothing is stale"


def test_plain_words_and_calls_with_arguments_are_not_checked():
    rules = "Say done when the tests pass.\nCall render_report(rows) with the rows."
    assert stale_references(rules, set()) == [], "only name() with empty parentheses is a reference"


def test_each_stale_reference_reports_its_line_number():
    rules = "Build with format_report().\nSay done after make_table().\nUse render_report()."
    assert stale_references(rules, defined_names(CODE)) == [(1, "format_report"), (2, "make_table")], "two stale lines, numbered from 1"


def test_an_empty_rules_file_has_no_stale_references():
    assert stale_references("", defined_names(CODE)) == [], "nothing to check, nothing stale"
