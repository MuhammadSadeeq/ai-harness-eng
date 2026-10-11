import json

from kata import trace_lines

KEY = "sk-a1B2c3D4e5F6g7H8"
EVENTS = [
    {"t": 0.5, "turn": 0, "kind": "model", "wire": "loop", "text": "start"},
    {"t": 1.25, "turn": 1, "kind": "tool", "wire": "tools", "text": "run " + KEY},
    {"t": 2.0, "turn": 1, "kind": "end", "wire": "loop"},
]


def parse(lines):
    return [json.loads(line) for line in lines]


def test_one_line_per_event_in_order():
    lines = trace_lines("r1", EVENTS)
    assert len(lines) == 3, "one line per event"
    assert all(isinstance(line, str) for line in lines), "each line is a string"


def test_each_line_is_an_object_with_exactly_the_schema_keys():
    for record in parse(trace_lines("r1", EVENTS)):
        assert set(record) == {"v", "run", "seq", "t", "turn", "kind", "wire", "text"}, "the schema keys, and no others"


def test_v_is_1_and_run_is_the_run_id():
    records = parse(trace_lines("r1", EVENTS))
    assert all(record["v"] == 1 for record in records), "v is always 1"
    assert all(record["run"] == "r1" for record in records), "run is the run's id"


def test_seq_counts_from_zero_across_turns():
    seqs = [record["seq"] for record in parse(trace_lines("r1", EVENTS))]
    assert seqs == [0, 1, 2], "seq runs 0, 1, 2 over the whole run, not per turn"


def test_the_fields_are_copied_and_t_stays_a_number():
    first = parse(trace_lines("r1", EVENTS))[0]
    assert first["t"] == 0.5 and isinstance(first["t"], float), "t is the event's time, still a number"
    assert first["turn"] == 0 and first["kind"] == "model" and first["wire"] == "loop", "the fields are copied"
    assert first["text"] == "start", "the text is kept when nothing in it looks like a key"


def test_a_missing_text_is_an_empty_string():
    last = parse(trace_lines("r1", EVENTS))[2]
    assert last["text"] == "", "no text given: the line still has a text field, empty"


def test_a_key_shaped_string_is_redacted():
    second = parse(trace_lines("r1", EVENTS))[1]
    assert second["text"] == "run [redacted]", "the key is replaced and the rest of the text stays"
    assert KEY not in trace_lines("r1", EVENTS)[1], "the key must not appear in the line at all"


def test_a_short_sk_string_is_not_a_key():
    short = "sk-abcdef12345"
    events = [{"t": 0, "turn": 0, "kind": "k", "wire": "w", "text": short}]
    assert parse(trace_lines("r1", events))[0]["text"] == short, "fewer than 16 characters after sk- is not key-shaped"


def test_no_events_gives_no_lines():
    assert trace_lines("r1", []) == [], "an empty run writes nothing"
