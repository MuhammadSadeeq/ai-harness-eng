from kata import send_turn


class FakeModel:
    """A fake model. It returns its scripted replies in order and records what each call was sent."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.sent = []

    def __call__(self, messages):
        self.sent.append([dict(m) for m in messages])
        if not self.replies:
            raise AssertionError("ask was called more times than the script allows")
        return self.replies.pop(0)


def test_first_turn_sends_the_user_message():
    model = FakeModel(["Hello."])
    history = []
    send_turn(history, "Hi", model)
    assert model.sent == [[{"role": "user", "content": "Hi"}]], "the first call sends the one user message"


def test_second_turn_resends_the_whole_history():
    model = FakeModel(["Hello.", "Still here."])
    history = []
    send_turn(history, "Hi", model)
    send_turn(history, "Are you there?", model)
    assert model.sent[1] == [
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hello."},
        {"role": "user", "content": "Are you there?"},
    ], "the second call sends the earlier user message, the reply and the new message"


def test_history_alternates_roles_and_grows_by_two_each_turn():
    model = FakeModel(["one", "two", "three"])
    history = []
    for text in ["a", "b", "c"]:
        send_turn(history, text, model)
    assert len(history) == 6, "two messages per turn"
    assert [m["role"] for m in history] == ["user", "assistant"] * 3, "roles alternate, user first"


def test_returns_the_reply_text():
    model = FakeModel(["Sure."])
    assert send_turn([], "Please.", model) == "Sure.", "the reply text is returned"


def test_the_reply_is_kept_in_history():
    model = FakeModel(["Noted."])
    history = []
    send_turn(history, "Remember this.", model)
    assert history[-1] == {"role": "assistant", "content": "Noted."}, "the last message is the reply"
