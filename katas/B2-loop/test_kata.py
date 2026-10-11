from kata import run_loop


class FakeReplies:
    """A fake model. It returns the scripted replies in order and records the messages each call got."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.sent = []

    def __call__(self, messages):
        self.sent.append([dict(m) for m in messages])
        if not self.replies:
            raise AssertionError("the loop called the model more times than the script allows")
        return self.replies.pop(0)


def reply(stop_reason, content=(), input_tokens=0, output_tokens=0):
    return {
        "stop_reason": stop_reason,
        "content": list(content),
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }


def tool_use(call_id, name, data=None):
    return {"type": "tool_use", "id": call_id, "name": name, "input": data or {}}


def add(data):
    return str(data["a"] + data["b"])


TOOLS = {"add": add}


def test_end_turn_returns_done():
    model = FakeReplies([reply("end_turn")])
    assert run_loop(model, TOOLS, "hi", 5, 10_000) == "done", "end_turn should end the loop with done"
    assert len(model.sent) == 1, "a reply that says end_turn needs no second call"


def test_tool_use_runs_the_tool_and_calls_again():
    model = FakeReplies([reply("tool_use", [tool_use("t1", "add", {"a": 2, "b": 3})]), reply("end_turn")])
    assert run_loop(model, TOOLS, "add", 5, 10_000) == "done"
    assert len(model.sent) == 2, "after tool_use the loop must call the model again"
    result = model.sent[1][-1]["content"][0]
    assert result["tool_use_id"] == "t1", "the result must carry the id of its tool_use block"
    assert result["content"] == "5", "the result must hold what the tool returned"
    assert not result.get("is_error"), "a tool that ran is not an error"


def test_history_keeps_the_assistant_reply_and_the_results():
    model = FakeReplies([reply("tool_use", [tool_use("t1", "add", {"a": 1, "b": 1})]), reply("end_turn")])
    run_loop(model, TOOLS, "add", 5, 10_000)
    second = model.sent[1]
    assert len(second) == 3, "the second call sees: the task, the assistant reply, the results"
    assert second[0]["role"] == "user" and second[1]["role"] == "assistant", "keep the order of the history"
    assert second[2]["role"] == "user", "the results are a user message"


def test_all_results_go_in_one_user_message():
    two = [tool_use("t1", "add", {"a": 1, "b": 1}), tool_use("t2", "add", {"a": 2, "b": 2})]
    model = FakeReplies([reply("tool_use", two), reply("end_turn")])
    run_loop(model, TOOLS, "add twice", 5, 10_000)
    second = model.sent[1]
    assert len(second) == 3, "two results belong in one user message, not two messages"
    ids = [r["tool_use_id"] for r in second[2]["content"]]
    assert ids == ["t1", "t2"], "every result, in order, matched by its id"


def test_unknown_tool_is_an_error_result_not_an_exception():
    model = FakeReplies([reply("tool_use", [tool_use("t1", "nope")]), reply("end_turn")])
    assert run_loop(model, TOOLS, "try it", 5, 10_000) == "done", "an unknown tool should not stop the loop"
    result = model.sent[1][-1]["content"][0]
    assert result["tool_use_id"] == "t1", "the error result still carries the id"
    assert result.get("is_error") is True, "an unknown tool must be sent back as is_error true"


def test_turn_limit_stops_the_loop():
    replies = [reply("tool_use", [tool_use(f"t{i}", "add", {"a": 1, "b": 1})]) for i in range(10)]
    model = FakeReplies(replies)
    assert run_loop(model, TOOLS, "forever", 3, 10_000) == "max_turns", "after 3 calls the loop stops"
    assert len(model.sent) == 3, "the model must not be called a fourth time"


def test_token_budget_stops_before_the_next_call():
    # Each call uses 60 input and 50 output tokens: 110 per call.
    replies = [reply("tool_use", [tool_use(f"t{i}", "add", {"a": 1, "b": 1})], 60, 50) for i in range(3)]
    model = FakeReplies(replies)
    assert run_loop(model, TOOLS, "spend", 10, 150) == "budget", "220 tokens used is past a budget of 150"
    assert len(model.sent) == 2, "after 110 tokens the loop may call again; after 220 it may not"


def test_max_tokens_reply_is_not_run():
    ran = []

    def spy(data):
        ran.append(data)
        return "x"

    model = FakeReplies([reply("max_tokens", [tool_use("t1", "spy", {"a": 1})])])
    assert run_loop(model, {"spy": spy}, "cut off", 5, 10_000) == "max_tokens", "return max_tokens"
    assert ran == [], "a reply cut off at max_tokens must not run its tool call"


def test_refusal_returns_refusal():
    model = FakeReplies([reply("refusal")])
    assert run_loop(model, TOOLS, "refuse", 5, 10_000) == "refusal", "return refusal, do not raise"


def test_the_budget_is_spent_exactly_at_the_limit():
    model = FakeReplies([reply("tool_use", [tool_use("t1", "add", {"a": 1, "b": 2})], 100, 50)])
    assert run_loop(model, TOOLS, "spend", 10, 150) == "budget"
    assert len(model.sent) == 1
