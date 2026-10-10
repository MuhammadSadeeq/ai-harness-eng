from kata import read_reply


def text_block(text):
    return {"type": "text", "text": text}


def tool_block(call_id, name, data):
    return {"type": "tool_use", "id": call_id, "name": name, "input": data}


def test_text_of_every_block_is_read_in_order():
    reply = {"stop_reason": "tool_use", "content": [
        text_block("I'll read it."),
        tool_block("t1", "read_file", {"path": "a.py"}),
        text_block("Then I'll check it."),
    ]}
    text, _, _ = read_reply(reply)
    assert text == "I'll read it.\nThen I'll check it.", "every text block, in order, not only the first"


def test_every_tool_request_is_returned_in_order():
    reply = {"stop_reason": "tool_use", "content": [
        tool_block("t1", "read_file", {"path": "a.py"}),
        text_block("and"),
        tool_block("t2", "run_command", {"cmd": "pytest -q"}),
    ]}
    _, calls, _ = read_reply(reply)
    assert calls == [("t1", "read_file", {"path": "a.py"}), ("t2", "run_command", {"cmd": "pytest -q"})], \
        "every tool_use block, in order, with its id, name and input"


def test_tool_use_with_calls_means_run_tools():
    reply = {"stop_reason": "tool_use", "content": [tool_block("t1", "read_file", {"path": "a.py"})]}
    assert read_reply(reply)[2] == "run_tools", "a tool_use reply with calls runs the tools"


def test_end_turn_is_done_and_text_is_kept():
    reply = {"stop_reason": "end_turn", "content": [text_block("All tests pass.")]}
    text, calls, action = read_reply(reply)
    assert (text, calls, action) == ("All tests pass.", [], "done"), "end_turn is a done claim"


def test_max_tokens_stops_and_does_not_run_a_half_written_call():
    reply = {"stop_reason": "max_tokens", "content": [tool_block("t1", "run_command", {"cmd": "pyt"})]}
    assert read_reply(reply)[2] == "stop", "a reply cut off by max_tokens is not run"


def test_refusal_and_the_rest_stop():
    for reason in ["refusal", "pause_turn", "stop_sequence"]:
        reply = {"stop_reason": reason, "content": [text_block("No.")]}
        assert read_reply(reply)[2] == "stop", f"{reason} stops the run and runs nothing"


def test_tool_use_without_a_call_stops():
    reply = {"stop_reason": "tool_use", "content": [text_block("I will run it.")]}
    assert read_reply(reply)[2] == "stop", "a tool_use with no tool_use block has nothing to run"


def test_empty_content_with_end_turn_is_done():
    text, calls, action = read_reply({"stop_reason": "end_turn", "content": []})
    assert (text, calls, action) == ("", [], "done"), "an empty end_turn reply is still done, with no text"
