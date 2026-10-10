"""Wire payloads (ENGINE.md section 10): the request a turn sends and the response it gets."""

from __future__ import annotations

from typing import Any

from .spec import WIRE_MAX_TOKENS


def request_payload(
    model_id: str,
    system: str,
    tools: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    output_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model_id,
        "max_tokens": WIRE_MAX_TOKENS,
        "system": system,
        "tools": tools,
        "messages": messages,
    }
    if output_config is not None:  # A7.3: the board's effort level (fact api.effort-location)
        payload["output_config"] = output_config
    return payload


def response_payload(
    tag: str,
    model_id: str,
    content: list[dict[str, Any]],
    stop_reason: str,
    input_tokens: int,
    output_tokens: int,
) -> dict[str, Any]:
    return {
        "id": f"msg_{tag}",  # the turn, with a sub-agent's scope in front (A14)
        "type": "message",
        "role": "assistant",
        "model": model_id,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }
