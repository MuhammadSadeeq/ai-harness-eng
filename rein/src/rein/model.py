"""The scripted model (ENGINE.md sections 6.1 to 6.3, 7.6; amendments A3.14, A3.15, A3.22).

The script is walked as a queue of (step, location) pairs. The location is the JSON-pointer-style
path of the step in the tape's original script (A3.22), so every branch draw can be recorded as
``[path, option_index]``. Copies made by ``repeat`` keep their original location.
"""

from __future__ import annotations

import copy
from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from .prng import Mulberry32
from .spec import (
    EFFORT_LEVELS,
    MAX_SCRIPT_EXPANSIONS,
    MODEL_BASE_MS,
    MODEL_ERROR_MS,
    MODEL_PER_TOKEN_MS,
)
from .tape import Tape
from .tokens import tokens


class ScriptError(RuntimeError):
    """The script cannot make progress: a tape bug, not a run outcome (A3.13). No event."""


@dataclass(frozen=True)
class ToolUse:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class Reply:
    say: str | None
    content: list[dict[str, Any]]
    tool_uses: list[ToolUse]
    stop_reason: str
    latency_ms: int
    output_tokens: int


@dataclass(frozen=True)
class ErrorOutcome:
    type: str
    retry_after_ms: int
    error_ms: int


@dataclass(frozen=True)
class CallContext:
    turn: int  # the current turn, 1-based (A3.15)
    t: int
    messages: list[dict[str, Any]]
    last_permission: str | None  # the last permission's final decision
    last_truncated: bool  # the last tool_call of the run was truncated
    feedback_pending: bool  # the last user message is the gate's feedback
    sent: list[dict[str, Any]] | None = None  # A5: the messages this request sends (None: messages)
    request: dict[str, Any] | None = (
        None  # A6.1: the request about to be sent (None: messages only)
    )
    prompt_tokens: int = 0  # A6.1: tokens(request)
    window: int = 0  # A6.1: the tape window
    level: str = "high"  # A7.3: the effort level in force
    thinking: int = 0  # A7.3: thinking tokens this reply adds to its output


Entry = tuple[dict[str, Any], str]


@dataclass
class ScriptedModel:
    tape: Tape
    rng: Mulberry32
    queue: deque[Entry] = field(init=False)
    choices: list[tuple[str, int]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.queue = deque(
            (copy.deepcopy(step), f"/script/{index}") for index, step in enumerate(self.tape.script)
        )

    def call(self, ctx: CallContext) -> Reply | ErrorOutcome:
        """Outage, then faults (in order, stopping at the first failure), then the script."""
        outage = self.tape.outage
        if outage is not None and int(outage["from_ms"]) <= ctx.t < int(outage["to_ms"]):
            return ErrorOutcome(
                type=str(outage["type"]),
                retry_after_ms=int(outage.get("retry_after_ms", 0)),
                error_ms=MODEL_ERROR_MS,
            )
        for fault in self.tape.faults:
            if self.rng.percent() < int(fault["percent"]):
                return ErrorOutcome(
                    type=str(fault["type"]), retry_after_ms=0, error_ms=MODEL_ERROR_MS
                )
        return self._next(ctx)

    def _next(self, ctx: CallContext) -> Reply | ErrorOutcome:
        expansions = 0
        while True:
            if not self.queue:
                return self._reply({"say": "(the script has run out)"}, ctx)
            step, location = self.queue.popleft()
            if "error" in step:
                return ErrorOutcome(
                    type=str(step["error"]),
                    retry_after_ms=int(step.get("retry_after_ms", 0)),
                    error_ms=int(step.get("error_ms", MODEL_ERROR_MS)),
                )
            if "branch" in step:
                options = step["branch"]
                index = self._draw_option(options)
                self.choices.append((location, index))
                self._splice(list(options[index]["then"]), f"{location}/branch/{index}/then")
            elif "when" in step:
                items = step["when"]
                chosen = _choose_when(items, ctx)
                if chosen is not None:
                    position, key, steps = chosen
                    self._splice(steps, f"{location}/when/{position}/{key}")
            elif "repeat" in step:
                body = step["repeat"]
                steps = list(body["steps"])
                base = f"{location}/repeat/steps"
                if body["times"] == "forever":
                    self._splice_entries(
                        [(copy.deepcopy(s), f"{base}/{k}") for k, s in enumerate(steps)]
                        + [(copy.deepcopy(step), location)]
                    )
                else:
                    copies: list[Entry] = []
                    for _ in range(int(body["times"])):
                        copies.extend(
                            (copy.deepcopy(s), f"{base}/{k}") for k, s in enumerate(steps)
                        )
                    self._splice_entries(copies)
            else:
                return self._reply(step, ctx)
            expansions += 1
            if expansions >= MAX_SCRIPT_EXPANSIONS:
                raise ScriptError(
                    f"the script expanded {MAX_SCRIPT_EXPANSIONS} steps without a reply"
                )

    def _splice(self, steps: list[dict[str, Any]], base: str) -> None:
        self._splice_entries([(copy.deepcopy(step), f"{base}/{k}") for k, step in enumerate(steps)])

    def _splice_entries(self, entries: list[Entry]) -> None:
        self.queue.extendleft(reversed(entries))

    def _draw_option(self, options: list[dict[str, Any]]) -> int:
        draw = self.rng.percent()
        cumulative = 0
        for index, option in enumerate(options):
            cumulative += int(option["percent"])
            if draw < cumulative:
                return index
        return len(options) - 1

    def _reply(self, step: dict[str, Any], ctx: CallContext) -> Reply:
        content: list[dict[str, Any]] = []
        say: str | None = None
        if "say" in step:
            say = str(step["say"])
            content.append({"type": "text", "text": say})
        tool_uses: list[ToolUse] = []
        for index, pair in enumerate(step.get("tools", []), start=1):
            name = str(pair[0])
            tool_input = copy.deepcopy(dict(pair[1]))
            tool_id = f"toolu_{ctx.turn}_{index}"
            tool_uses.append(ToolUse(id=tool_id, name=name, input=tool_input))
            content.append({"type": "tool_use", "id": tool_id, "name": name, "input": tool_input})
        default_stop = "tool_use" if tool_uses else "end_turn"
        stop = str(step["stop"]) if "stop" in step else default_stop
        output_tokens = tokens(content) + ctx.thinking  # A7.3: thinking is billed as output
        if "latency_ms" in step:
            latency = int(step["latency_ms"])
        else:
            latency = MODEL_BASE_MS + MODEL_PER_TOKEN_MS * output_tokens
        return Reply(
            say=say,
            content=content,
            tool_uses=tool_uses,
            stop_reason=stop,
            latency_ms=latency,
            output_tokens=output_tokens,
        )


def _choose_when(
    items: list[dict[str, Any]], ctx: CallContext
) -> tuple[int, str, list[dict[str, Any]]] | None:
    """The first true `if`, else the `else` item; (position, key, steps) or None."""
    for position, item in enumerate(items):
        if "else" in item:
            return position, "else", list(item["else"])
        if condition_holds(str(item["if"]), ctx):
            return position, "then", list(item["then"])
    return None


def condition_holds(condition: str, ctx: CallContext) -> bool:
    if condition == "last_result_error":
        return any(
            block.get("type") == "tool_result" and block.get("is_error") is True
            for block in _last_user_content(ctx.messages)
        )
    if condition == "last_denied":
        return ctx.last_permission == "deny"
    if condition == "verify_feedback":
        return ctx.feedback_pending
    if condition == "last_truncated":
        return ctx.last_truncated
    if condition.startswith("turn_gte:"):
        return ctx.turn >= int(condition.split(":", 1)[1])
    if condition.startswith(
        "history_lt:"
    ):  # A5: the request about to be sent has fewer than n messages
        sent = ctx.messages if ctx.sent is None else ctx.sent
        return len(sent) < int(condition.split(":", 1)[1])
    if condition.startswith("context_gte:"):  # A6.1: 100 * tokens(request) >= n * window
        return 100 * ctx.prompt_tokens >= int(condition.split(":", 1)[1]) * ctx.window
    if condition.startswith("sent_lacks:"):  # A6.1: no string value of the request contains text
        text = condition.split(":", 1)[1]
        request = ctx.request if ctx.request is not None else {"messages": ctx.messages}
        return not any(text in value for value in _string_values(request))
    if condition.startswith("tools_gte:"):  # A9.2: at least n tool definitions in the request
        return len(_request_tools(ctx)) >= int(condition.split(":", 1)[1])
    if condition.startswith("tool_loaded:"):  # A9.2: the named tool is among the request's tools
        name = condition.split(":", 1)[1]
        return any(tool.get("name") == name for tool in _request_tools(ctx))
    if condition.startswith("effort_gte:"):  # A7.3: the level in force, in EFFORT_LEVELS order
        wanted = condition.split(":", 1)[1]
        return EFFORT_LEVELS.index(ctx.level) >= EFFORT_LEVELS.index(wanted)
    if condition == "results_split":  # A7.2: two user messages in a row in the request
        sent = ctx.messages if ctx.sent is None else ctx.sent
        roles = [message.get("role") for message in sent]
        return any(a == "user" and b == "user" for a, b in zip(roles, roles[1:], strict=False))
    raise ScriptError(f"unknown condition {condition!r}")


def _request_tools(ctx: CallContext) -> list[dict[str, Any]]:
    """The tool definitions of the request about to be sent (A9.2)."""
    if ctx.request is None:
        return []
    tools: list[dict[str, Any]] = ctx.request["tools"]
    return tools


def _string_values(value: Any) -> Iterator[str]:
    """Every string value inside a JSON value, recursively: values, not keys (A6.1)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _string_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _string_values(item)


def _last_user_content(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for message in reversed(messages):
        if message.get("role") == "user":
            content: list[dict[str, Any]] = message.get("content", [])
            return content
    return []


def missing_results(messages: list[dict[str, Any]]) -> list[str]:
    """tool_use ids (A3.16, A5.5(a), A7.2) with no tool_result in the user messages after
    their assistant message: the harness's own history, checked before every model call."""
    missing: list[str] = []
    for index, message in enumerate(messages):
        if message.get("role") != "assistant":
            continue
        used = [str(b["id"]) for b in message.get("content", []) if b.get("type") == "tool_use"]
        if not used:
            continue
        answered: set[str] = set()
        follow = index + 1
        while follow < len(messages) and messages[follow].get("role") == "user":
            answered.update(
                str(b["tool_use_id"])
                for b in messages[follow].get("content", [])
                if b.get("type") == "tool_result"
            )
            follow += 1
        missing.extend(tool_id for tool_id in used if tool_id not in answered)
    return missing
