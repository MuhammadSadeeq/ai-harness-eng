from kata import results_message


def run_ok(name, tool_input):
    return f"{name} ran with {tool_input}"


def test_one_message_holds_every_result():
    uses = [
        {"id": "a1", "name": "read_file", "input": {"path": "a.txt"}},
        {"id": "b2", "name": "read_file", "input": {"path": "b.txt"}},
    ]
    message = results_message(uses, run_ok)
    assert message["role"] == "user", "the results go in a user message"
    assert len(message["content"]) == 2, "one tool_result per tool_use, in one message"


def test_each_result_carries_the_id_of_its_call():
    uses = [
        {"id": "b7", "name": "read_file", "input": {"path": "b.txt"}},
        {"id": "a1", "name": "read_file", "input": {"path": "a.txt"}},
    ]
    content = results_message(uses, run_ok)["content"]
    assert [block["tool_use_id"] for block in content] == ["b7", "a1"], (
        "match each result to its tool_use id, in call order"
    )


def test_a_result_is_a_tool_result_with_its_output():
    uses = [{"id": "a1", "name": "read_file", "input": {"path": "a.txt"}}]
    block = results_message(uses, run_ok)["content"][0]
    assert block["type"] == "tool_result", "the block type is tool_result"
    assert block["content"] == "read_file ran with {'path': 'a.txt'}", "run gets the name and the input"


def test_a_good_result_is_not_an_error():
    uses = [{"id": "a1", "name": "read_file", "input": {"path": "a.txt"}}]
    block = results_message(uses, run_ok)["content"][0]
    assert not block.get("is_error"), "is_error is set only when the call failed"


def test_a_failing_tool_is_marked_is_error():
    def run(name, tool_input):
        raise FileNotFoundError("no such file: c.txt")

    uses = [{"id": "c3", "name": "read_file", "input": {"path": "c.txt"}}]
    block = results_message(uses, run)["content"][0]
    assert block["tool_use_id"] == "c3", "the error still carries the id"
    assert block.get("is_error") is True, "a failed call is marked is_error"
    assert "no such file" in block["content"], "the content says why it failed"


def test_a_failure_does_not_stop_the_other_calls():
    def run(name, tool_input):
        if tool_input["path"] == "b.txt":
            raise OSError("disk gone")
        return "ok"

    uses = [
        {"id": "a1", "name": "read_file", "input": {"path": "a.txt"}},
        {"id": "b2", "name": "read_file", "input": {"path": "b.txt"}},
        {"id": "c3", "name": "read_file", "input": {"path": "c.txt"}},
    ]
    content = results_message(uses, run)["content"]
    assert [block["tool_use_id"] for block in content] == ["a1", "b2", "c3"], "every call gets a result"
    assert [bool(block.get("is_error")) for block in content] == [False, True, False], (
        "only the failing call is an error"
    )
