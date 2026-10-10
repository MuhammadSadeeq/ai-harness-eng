from dataclasses import dataclass


@dataclass
class Reply:
    """One model reply.

    It has text, a stop reason and output tokens. Name the three
    fields with their types. Give output_tokens a default of 0.
    """

    pass


def is_done(reply: Reply) -> bool:
    """Return True when the reply's stop_reason is end_turn."""
    raise NotImplementedError("return True for end_turn")


def first_text(replies: list[Reply]) -> str | None:
    """Return the text of the first reply.

    Return None for an empty list.
    """
    raise NotImplementedError("return the first text, or None")
