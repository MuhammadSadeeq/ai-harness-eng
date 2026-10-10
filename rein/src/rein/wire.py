"""Wire payloads (ENGINE.md section 10): the request a turn sends and the response it gets."""

from __future__ import annotations

from typing import Any

from .spec import WIRE_MAX_TOKENS


def request_payload(
    model_id: str, system: str, tools: list[dict[str, Any]], messages: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "model": model_id,
        "max_tokens": WIRE_MAX_TOKENS,
        "system": system,
        "tools": tools,
        "messages": messages,
    }


def response_payload(
    turn: int,
    model_id: str,
    content: list[dict[str, Any]],
    stop_reason: str,
    input_tokens: int,
    output_tokens: int,
) -> dict[str, Any]:
    return {
        "id": f"msg_{turn}",
        "type": "message",
        "role": "assistant",
        "model": model_id,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }
