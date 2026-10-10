"""check_wire accepts the A6 and A7 wire fields: output_config, cache_control, usage."""

from __future__ import annotations

from typing import Any

from tools.check_wire import check_request, check_response


def _request(**extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": "claude-sonnet-5-5",
        "max_tokens": 4096,
        "system": "You are a test agent.",
        "tools": [],
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "hi", "cache_control": {"type": "ephemeral"}}],
            }
        ],
    }
    payload.update(extra)
    return payload


def _response(**usage: Any) -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5-5",
        "content": [{"type": "text", "text": "hi"}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 5, **usage},
    }


def test_a_request_with_output_config_and_a_cache_breakpoint_is_accepted() -> None:
    problems: list[str] = []
    check_request(_request(output_config={"effort": "high"}), "request", problems)
    assert problems == []


def test_an_unknown_output_config_key_is_refused() -> None:
    problems: list[str] = []
    check_request(_request(output_config={"effort": "high", "budget": 3}), "request", problems)
    assert any("budget" in problem for problem in problems)


def test_a_response_with_cache_usage_is_accepted() -> None:
    problems: list[str] = []
    check_response(
        _response(cache_creation_input_tokens=0, cache_read_input_tokens=3),
        "response",
        problems,
    )
    assert problems == []


def test_a_response_with_thinking_details_is_accepted() -> None:
    problems: list[str] = []
    check_response(_response(output_tokens_details={"thinking_tokens": 2}), "response", problems)
    assert problems == []
