from kata import handoff


def test_each_finished_item_is_a_done_line():
    note = handoff({"done": ["parser", "tests written"], "next": "run the tests"})
    assert "Done: parser" in note.splitlines() and "Done: tests written" in note.splitlines(), "one line per finished item"


def test_the_next_step_is_one_line_and_names_the_step():
    note = handoff({"done": ["parser"], "next": "run the tests in tests/"})
    assert "Next: run the tests in tests/" in note.splitlines(), "the next session reads the step on one line"


def test_a_note_with_no_next_step_is_refused():
    try:
        handoff({"done": ["parser"], "next": "  "})
    except ValueError:
        return
    assert False, "without a next step the next session has to guess, so the note is refused"


def test_a_note_with_no_done_item_is_refused():
    try:
        handoff({"done": [], "next": "run the tests"})
    except ValueError:
        return
    assert False, "a note that says nothing is done leaves the next session to redo the work"


def test_a_next_step_over_two_lines_is_refused():
    try:
        handoff({"done": ["parser"], "next": "run the tests\nthen write the report"})
    except ValueError:
        return
    assert False, "one next step, on one line"


def test_open_questions_and_files_are_kept():
    note = handoff({"done": ["parser"], "next": "run the tests", "open": ["is the migration safe?"], "files": ["parser.py", " report.txt "]})
    assert "Open: is the migration safe?" in note.splitlines(), "an open question is kept"
    assert "Files: parser.py, report.txt" in note.splitlines(), "the files to start from are kept, trimmed"
