from kata import parse_events


def test_one_data_line_is_one_event():
    assert parse_events("data: hello\n\n") == [{"event": "message", "data": "hello"}], (
        "the default event name is message"
    )


def test_the_event_name_is_kept():
    assert parse_events("event: ping\ndata: {}\n\n") == [{"event": "ping", "data": "{}"}]


def test_data_lines_join_with_a_newline():
    assert parse_events("data: a\ndata: b\n\n") == [{"event": "message", "data": "a\nb"}], (
        "two data lines make one value with a newline between them"
    )


def test_comment_lines_are_skipped():
    assert parse_events(": keep-alive\n\ndata: x\n\n") == [{"event": "message", "data": "x"}], (
        "a line that starts with a colon is a comment"
    )


def test_two_events_come_back_in_order():
    assert parse_events("data: 1\n\ndata: 2\n\n") == [
        {"event": "message", "data": "1"},
        {"event": "message", "data": "2"},
    ]


def test_an_unfinished_event_is_not_returned():
    assert parse_events("data: 1\n\ndata: 2") == [{"event": "message", "data": "1"}], (
        "no blank line after data 2, so it is not an event yet"
    )


def test_a_block_with_no_data_is_skipped():
    assert parse_events("event: ping\n\n") == [], "an event with no data is not returned"


def test_only_one_space_after_the_colon_is_removed():
    assert parse_events("data:  x\n\n") == [{"event": "message", "data": " x"}], (
        "the first space goes; the second stays"
    )
