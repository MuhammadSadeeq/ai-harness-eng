import dataclasses
import typing

from kata import Reply, first_text, is_done


def test_reply_is_a_dataclass():
    assert dataclasses.is_dataclass(Reply), (
        "Reply should be a dataclass: put @dataclass above the class"
    )


def test_the_fields_are_named_in_order():
    names = [field.name for field in dataclasses.fields(Reply)]
    assert names == ["text", "stop_reason", "output_tokens"], (
        "the fields are text, stop_reason and output_tokens"
    )


def test_output_tokens_defaults_to_zero():
    reply = Reply(text="hi", stop_reason="end_turn")
    assert reply.output_tokens == 0, "output_tokens should default to 0"


def test_fields_can_be_passed_by_name():
    reply = Reply(stop_reason="tool_use", text="run it", output_tokens=4)
    assert (reply.text, reply.stop_reason, reply.output_tokens) == (
        "run it",
        "tool_use",
        4,
    ), "named fields hold what you pass"


def test_fields_are_annotated_with_their_types():
    assert Reply.__annotations__["text"] is str, (
        "text should be annotated str"
    )
    assert Reply.__annotations__["output_tokens"] is int, (
        "output_tokens should be annotated int"
    )


def test_is_done_is_true_only_for_end_turn():
    assert is_done(Reply(text="ok", stop_reason="end_turn")) is True, (
        "end_turn means done"
    )
    assert is_done(Reply(text="run", stop_reason="tool_use")) is False, (
        "tool_use is not done"
    )
    assert is_done(Reply(text="cut", stop_reason="max_tokens")) is False, (
        "max_tokens is not done"
    )


def test_first_text_returns_the_first_reply_text():
    replies = [
        Reply(text="first", stop_reason="tool_use"),
        Reply(text="second", stop_reason="end_turn"),
    ]
    assert first_text(replies) == "first", "the text of the first reply"


def test_first_text_is_none_for_no_replies():
    assert first_text([]) is None, (
        "an empty list gives None, not an empty string"
    )


def test_first_text_is_annotated_as_possibly_none():
    annotation = first_text.__annotations__["return"]
    assert type(None) in typing.get_args(annotation), (
        "the return type should allow None"
    )
