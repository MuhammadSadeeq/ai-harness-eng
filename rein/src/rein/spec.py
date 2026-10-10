"""Constants fixed by docs/ENGINE.md (one place, so every module reads the same values)."""

from __future__ import annotations

import re

ENGINE_VERSION = 1
SAFETY_TURNS = 60  # section 7.1: the operator stop, for runaway runs
MODEL_ERROR_MS = 300  # section 4: error_ms default; also the outage and fault failures
MODEL_BASE_MS = 600  # section 4: model call latency = 600 + 20 * output tokens
MODEL_PER_TOKEN_MS = 20
WIRE_MAX_TOKENS = 4096  # section 10: the request's max_tokens
OUTPUT_CAP_MARKER = "\n[... {n} characters cut; ask for a smaller range ...]\n"
REDACTED = "[REDACTED]"
BUILTIN_TOOLS = ("read_file", "write_file", "edit_file", "list_files", "run_command")
BUILTIN_LATENCY_MS = {
    "read_file": 100,
    "write_file": 100,
    "edit_file": 100,
    "list_files": 100,
    "run_command": 2000,
}
# A3.2: an unknown tool and a custom tool without latency_ms take 100 ms.
UNKNOWN_TOOL_LATENCY_MS = 100
CUSTOM_TOOL_DEFAULT_LATENCY_MS = 100
# A3.14: the expansion limit of one model call (steps that produce no reply).
MAX_SCRIPT_EXPANSIONS = 100_000
# A3.19: the facts registry, relative to the working directory.
DEFAULT_FACTS_PATH = "site/data/facts.json"
ERROR_TYPES = ("overloaded", "rate_limit", "api_error", "timeout", "invalid_request")
TRANSIENT = frozenset({"overloaded", "rate_limit", "api_error", "timeout"})
# Section 7.6: the message of the permanent missing-result error (A3.16).
MISSING_RESULT_MESSAGE = "tool_use ids were found without tool_result blocks immediately after"
ERROR_MESSAGES = {
    "overloaded": "Overloaded",
    "rate_limit": "Rate limited",
    "api_error": "Internal server error",
    "timeout": "Request timed out",
    "invalid_request": "Invalid request",  # A3.14: a scripted or faulted invalid_request
}
STATUSES = (
    "done",
    "unverified",
    "max_turns",
    "budget",
    "loop",
    "circuit_open",
    "interrupted",
    "refused",
    "max_tokens_reply",
    "error",
)
MODULES = (
    "turn_limit",
    "token_budget",
    "loop_detect",
    "output_cap",
    "retry",
    "breaker",
    "permissions",
    "sandbox",
    "verify_gate",
    "close_books",
    "rules_file",
    "redact",
)
# Section 9: the wire of every event kind.
KIND_WIRE = {
    "run_start": "loop",
    "prompt_built": "control",
    "context_check": "context",
    "model_call": "loop",
    "model_error": "errors",
    "retry_wait": "errors",
    "breaker": "errors",
    "recovery_check": "errors",
    "model_reply": "loop",
    "interrupt": "loop",
    "permission": "permissions",
    "sandbox": "permissions",
    "tool_call": "tools",
    "verify": "verify",
    "guard": "loop",
    "trace_write": "observe",
    "run_end": "loop",
}
ASCII_PATTERN = re.compile(r"[\x20-\x7e\n\t]*")
CANONICAL_INDEX = re.compile(r"(0|[1-9][0-9]*)")
