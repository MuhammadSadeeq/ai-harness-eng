from kata import compact, new_history

NOTES = [
    {"id": "n1", "kind": "goal", "turn": 0, "text": "Show the new totals."},
    {"id": "n2", "kind": "constraint", "turn": 0, "text": "Keep the public signature."},
    {"id": "n3", "kind": "decision", "turn": 1, "text": "Use the ledger rows."},
    {"id": "n4", "kind": "progress", "turn": 4, "text": "Totals are read."},
]


def test_only_the_kinds_to_keep_are_in_the_summary():
    text = compact(NOTES, ["goal", "constraint"], 3)
    assert "- goal: Show the new totals." in text, "a goal in keep is kept"
    assert "- constraint: Keep the public signature." in text, "a constraint in keep is kept"
    assert "decision" not in text, "a decision not in keep is dropped"


def test_a_note_from_the_current_turn_is_not_kept_yet():
    text = compact(NOTES, ["progress"], 4)
    assert "Totals are read" not in text, "the note's turn must be before the current turn"


def test_the_summary_has_its_heading_and_a_line_per_note():
    text = compact(NOTES, ["goal", "decision"], 3)
    assert text.startswith("Summary of the work so far:"), "the summary starts with its heading"
    assert text.count("\n- ") == 2, "one line per kept note"


def test_nothing_kept_says_so():
    assert compact(NOTES, [], 3) == "Summary of the work so far:\n- (nothing kept)", "an empty keep list says nothing was kept"


def test_the_history_becomes_the_summary_and_the_last_two_messages():
    messages = [{"role": "user", "content": "task"}, {"role": "assistant", "content": "a"}, {"role": "user", "content": "b"},
                {"role": "assistant", "content": "c"}, {"role": "user", "content": "d"}]
    new = new_history(messages, NOTES, ["goal"], 3)
    assert len(new) == 3, "the summary plus the last two messages"
    assert new[0]["role"] == "user" and new[0]["content"].startswith("Summary of the work so far:"), "the summary is the first message"
    assert new[1:] == messages[-2:], "the last two messages stay as they were"


def test_a_short_history_is_left_alone():
    messages = [{"role": "user", "content": "task"}, {"role": "assistant", "content": "a"}]
    assert new_history(messages, NOTES, ["goal"], 3) == messages, "fewer than five messages are not compacted"
