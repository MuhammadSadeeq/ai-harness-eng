"""Constants fixed by docs/ENGINE.md (one place, so every module reads the same values)."""

from __future__ import annotations

import re
from typing import Any

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
NOTE_KINDS = ("goal", "constraint", "decision", "progress", "file")  # A6.2
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")  # A7.3, in order
TOOL_SEARCH_NAME = "tool_search"  # A9.2
TOOL_SEARCH_LATENCY_MS = 100
TOOL_SEARCH_MAX = 5  # at most this many tools per search
TOOL_SEARCH_DEF: dict[str, Any] = {
    "name": "tool_search",
    "description": "Find tools by keyword and load their definitions for the next request.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Words that describe the tool you need"}
        },
        "required": ["query"],
        "additionalProperties": False,
    },
}
DEFAULT_EFFORT = "high"  # A7.3: the level when neither the board nor the tape gives one
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
    "history",
    "first_block_only",
    "compaction",
    "system_clock",
    "cache",
    "validate_inputs",
    "split_results",
    "effort",
    "tool_overrides",
    "tool_search",
    "cost_attribution",
    "tool_pins",  # A11.5
    "subagents",  # A14.1
    "progress_file",  # A14.2
    "durable_session",  # A14.3
    "tool_retry",  # A14.4
    "idempotency",  # A14.4
    "model",  # A14.5
    "request_params",  # A14.5
    "capability_check",  # A14.5
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
    "compaction": "context",
    "cache": "context",
    "input_check": "tools",
    "cost": "observe",
    "leak": "permissions",  # A11.3
    "tool_rejected": "tools",  # A11.5
    "subagent_start": "loop",  # A14.6
    "subagent_end": "loop",  # A14.6
    "session_start": "context",  # A14.6
    "crash": "loop",  # A14.6
    "resume": "loop",  # A14.6
    "capability": "control",  # A14.6
}
TRIFECTA = ("private_data", "untrusted_content", "exfiltration")  # A11.4, the labels, in order
EVAL_KINDS = ("capability", "regression")  # A12.3
EVAL_MAX_TASKS = 20  # A11.7
EVAL_MAX_TRIALS = 50
NAME_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")  # A12.3: a task's tape id
ASCII_PATTERN = re.compile(r"[\x20-\x7e\n\t]*")
CANONICAL_INDEX = re.compile(r"(0|[1-9][0-9]*)")
# A14: sub-agents, sessions, crash and resume, ledgers and retries, model profiles.
RUN_AGENT_NAME = "run_agent"  # A14.1: the harness's own tool, last in the request's tools
RUN_AGENT_LATENCY_MS = 100
RUN_AGENT_DEF: dict[str, Any] = {
    "name": "run_agent",
    "description": "Hand a self-contained task to a sub-agent and get its final answer back.",
    "input_schema": {
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "Which sub-agent to run"},
            "brief": {"type": "string", "description": "The task, and what to return"},
        },
        "required": ["agent", "brief"],
        "additionalProperties": False,
    },
}
AGENT_NAME_PATTERN = re.compile(r"[a-z][a-z0-9-]*")  # A14.1: an agent's name in the tape
SUB_AGENT_CONTEXTS = ("isolated", "forked")
SESSION_HANDOFF = ("done", "max_turns", "unverified")  # A14.2: a session that hands over
SESSIONS_MIN = 2
SESSIONS_MAX = 5
TIMED_OUT_PREFIX = "Timed out"  # A14.4: a tool result starting with this is retried
LOST_REPLY_OUTPUT = "Timed out waiting for the reply; the action may have happened."  # A14.4
MODEL_PROFILE_KEYS = frozenset({"pricing", "rejects", "script"})  # A14.5
