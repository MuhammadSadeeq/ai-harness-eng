"""The scripted model (ENGINE.md sections 6.1 to 6.3, 7.6; amendments A3.14, A3.15, A3.22).

The script is walked as a queue of (step, location) pairs. The location is the JSON-pointer-style
path of the step in the tape's original script (A3.22), so every branch draw can be recorded as
``[path, option_index]``. Copies made by ``repeat`` keep their original location.
"""

from __future__ import annotations

import copy
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from .prng import Mulberry32
from .spec import MAX_SCRIPT_EXPANSIONS, MODEL_BASE_MS, MODEL_ERROR_MS, MODEL_PER_TOKEN_MS
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
        output_tokens = tokens(content)
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
    raise ScriptError(f"unknown condition {condition!r}")


def _last_user_content(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for message in reversed(messages):
        if message.get("role") == "user":
            content: list[dict[str, Any]] = message.get("content", [])
            return content
    return []


def missing_results(messages: list[dict[str, Any]]) -> list[str]:
    """tool_use ids anywhere in the messages that have no matching tool_result (section 7.6)."""
    used: list[str] = []
    answered: set[str] = set()
    for message in messages:
        for block in message.get("content", []):
            if block.get("type") == "tool_use":
                used.append(str(block["id"]))
            elif block.get("type") == "tool_result":
                answered.add(str(block["tool_use_id"]))
    return [tool_id for tool_id in used if tool_id not in answered]
