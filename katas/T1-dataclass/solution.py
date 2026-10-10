from dataclasses import dataclass


@dataclass
class Reply:
    text: str
    stop_reason: str
    output_tokens: int = 0


def is_done(reply: Reply) -> bool:
    return reply.stop_reason == "end_turn"


def first_text(replies: list[Reply]) -> str | None:
    if not replies:
        return None
    return replies[0].text
