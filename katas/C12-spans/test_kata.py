from kata import spans

TRACE = [
    {"kind": "run_start", "seq": 0, "t": 0, "turn": 0, "agent": "main", "model_id": "claude-sonnet-5-5"},
    {"kind": "prompt_built", "seq": 1, "t": 0, "turn": 1, "tokens": 329},
    {"kind": "model_call", "seq": 3, "t": 0, "turn": 1, "tokens_in": 329},
    {"kind": "model_reply", "seq": 5, "t": 1400, "turn": 1, "usage": {"input_tokens": 329, "output_tokens": 39}},
    {"kind": "tool_call", "seq": 7, "t": 1500, "turn": 1, "tool": "read_file", "tool_use_id": "toolu_1_1"},
    {"kind": "prompt_built", "seq": 10, "t": 1500, "turn": 2, "tokens": 2381},
    {"kind": "model_call", "seq": 12, "t": 1500, "turn": 2, "tokens_in": 2381},
    {"kind": "model_reply", "seq": 14, "t": 2600, "turn": 2, "usage": {"input_tokens": 2381, "output_tokens": 60}},
    {"kind": "tool_call", "seq": 16, "t": 2700, "turn": 2, "tool": "write_file", "tool_use_id": "toolu_2_1"},
    {"kind": "run_end", "seq": 18, "t": 2800, "turn": 2, "status": "done"},
]


def test_the_run_is_the_first_span():
    assert spans(TRACE)[0] == {"name": "invoke_agent main", "kind": "run", "parent": None, "start": 0, "end": 2800, "attributes": {}}, "the run starts at run_start and ends at the last event"


def test_each_turn_is_a_child_of_the_run():
    found = spans(TRACE)
    assert (found[1]["name"], found[1]["kind"], found[1]["parent"]) == ("turn 1", "turn", 0), "turn 1 is a child of the run"
    assert (found[4]["name"], found[4]["parent"]) == ("turn 2", 0), "turn 2 is a child of the run too"


def test_a_model_call_is_named_for_its_model():
    found = spans(TRACE)
    assert (found[2]["name"], found[2]["kind"], found[2]["parent"]) == ("chat claude-sonnet-5-5", "model", 1), "the model span is named for the model and sits under its turn"


def test_the_model_span_carries_the_token_counts():
    assert spans(TRACE)[2]["attributes"] == {"gen_ai.request.model": "claude-sonnet-5-5", "gen_ai.usage.input_tokens": 329, "gen_ai.usage.output_tokens": 39}, "input from model_call, output from the reply"


def test_a_tool_call_is_a_child_of_its_turn():
    found = spans(TRACE)
    assert found[3] == {"name": "execute_tool read_file", "kind": "tool", "parent": 1, "start": 1500, "end": 1500, "attributes": {"gen_ai.tool.name": "read_file", "gen_ai.tool.call.id": "toolu_1_1"}}, "the tool span sits under turn 1"
    assert (found[6]["name"], found[6]["parent"]) == ("execute_tool write_file", 4), "the second tool sits under turn 2"


def test_a_turn_ends_at_its_last_event():
    found = spans(TRACE)
    assert (found[1]["start"], found[1]["end"]) == (0, 1500), "turn 1 ends at its tool call"
    assert (found[4]["start"], found[4]["end"]) == (1500, 2700), "turn 2 ends at its tool call, not at run_end"


def test_a_run_without_run_end_ends_at_its_last_event():
    assert spans(TRACE[:-1])[0]["end"] == 2700, "with no run_end, the run ends at the last event"


def test_an_empty_trace_gives_no_spans():
    assert spans([]) == [], "no events, no spans"
