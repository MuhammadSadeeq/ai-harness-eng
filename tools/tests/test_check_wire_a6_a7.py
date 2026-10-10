"""check_wire accepts the A6 and A7 wire fields (output_config, cache_control, usage) and,
for A9, the tool lists a run sends: overridden definitions and on-demand tool_search."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

from tools.check_wire import check_request, check_response

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rein" / "src"))
TOOL_SEARCH_DEF: dict[str, Any] = importlib.import_module("rein.spec").TOOL_SEARCH_DEF

READ_FILE: dict[str, Any] = {
    "name": "read_file",
    "description": "Reads a file.",
    "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
        "additionalProperties": False,
    },
}
WRITE_FILE: dict[str, Any] = {
    "name": "write_file",
    "description": "Writes a whole file. Use edit_file to change code.",
    "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
        "required": ["path", "content"],
        "additionalProperties": False,
    },
}
LINT_FILE: dict[str, Any] = {
    "name": "lint_file",
    "description": "Lint a Python file for style problems.",
    "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
        "additionalProperties": False,
    },
}


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


def test_the_tool_search_definition_is_accepted_in_a_request() -> None:
    problems: list[str] = []
    check_request(_request(tools=[READ_FILE, TOOL_SEARCH_DEF]), "request", problems)
    assert problems == []


def test_an_on_demand_tool_list_with_a_loaded_tool_is_accepted() -> None:
    problems: list[str] = []
    check_request(_request(tools=[READ_FILE, LINT_FILE, TOOL_SEARCH_DEF]), "request", problems)
    assert problems == []


def test_an_overridden_definition_is_accepted_with_its_new_description() -> None:
    problems: list[str] = []
    check_request(_request(tools=[WRITE_FILE]), "request", problems)
    assert problems == []


def test_a_tool_definition_with_an_unknown_key_is_refused() -> None:
    problems: list[str] = []
    check_request(_request(tools=[{**WRITE_FILE, "strict_mode": True}]), "request", problems)
    assert any("strict_mode" in problem for problem in problems)
