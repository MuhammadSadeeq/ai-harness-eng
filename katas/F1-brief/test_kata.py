from kata import make_brief, check_result


def test_the_brief_names_the_task_and_the_files():
    brief = make_brief("Find the dates in the notes.", ["notes/a.txt", "notes/b.txt"], ["date"])
    assert "Task: Find the dates in the notes." in brief, "the task is named"
    assert "Files: notes/a.txt, notes/b.txt" in brief, "every file the sub-agent may read is named"


def test_the_brief_asks_for_each_field_on_its_own_line():
    brief = make_brief("Count the items.", ["items.txt"], ["count", "first"])
    assert "- count" in brief.splitlines() and "- first" in brief.splitlines(), "one line per field"


def test_a_brief_with_no_files_is_refused():
    try:
        make_brief("Count the items.", [], ["count"])
    except ValueError:
        return
    assert False, "a brief the sub-agent cannot scope is refused"


def test_a_brief_with_no_fields_is_refused():
    try:
        make_brief("Count the items.", ["items.txt"], [])
    except ValueError:
        return
    assert False, "a result with nothing to return cannot be checked, so the brief is refused"


def test_a_result_with_every_field_passes():
    assert check_result("count: 3\nfirst: a.txt\n", ["count", "first"]), "both fields have values"


def test_a_result_with_an_empty_field_fails():
    assert not check_result("count: 3\nfirst:\n", ["count", "first"]), "an empty field is not an answer"


def test_a_result_missing_a_field_fails():
    assert not check_result("count: 3\n", ["count", "first"]), "a missing field fails the check"


def test_the_fields_are_found_on_any_line():
    assert check_result("Some preamble.\ncount: 3\nfirst: a.txt\n", ["count", "first"]), "the check reads every line"
