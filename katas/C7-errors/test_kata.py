from kata import input_error, no_match, truncated


def test_input_error_names_the_bad_field_and_the_allowed_ones():
    text = input_error("search_text", ["query", "path"], ["file"])
    assert text == "search_text has no field 'file'. It takes: query, path. Send again with only those fields.", text


def test_input_error_names_every_bad_field_when_there_are_several():
    text = input_error("search_text", ["query", "path"], ["file", "dir"])
    assert "has no fields 'file', 'dir'." in text, text
    assert text.endswith("Send again with only those fields."), "it says what to send next"


def test_input_error_keeps_the_allowed_fields_in_their_order():
    text = input_error("search_text", ["path", "query"], ["file"])
    assert "It takes: path, query." in text, "the tool's order, not a sorted one"


def test_input_error_is_short():
    text = input_error("search_text", ["query", "path"], ["file"])
    assert len(text) < 120, f"{len(text)} characters is too long for a result the model reads every time"


def test_no_match_says_what_was_searched_and_what_to_try():
    text = no_match("from calc import", "tests")
    assert text.startswith("No match for 'from calc import' in tests."), text
    assert "Try a shorter query" in text, "a next step, not only the failure"
    assert "path '.'" in text, "the whole-repository try is named"


def test_truncated_counts_with_thousands_commas():
    assert truncated(50, 1240) == "Showing the first 50 of 1,240 lines. Ask for a narrower range, or search for the text you need."


def test_truncated_says_what_to_ask_for_next():
    assert "Ask for a narrower range" in truncated(50, 1240), "the next step is named"
