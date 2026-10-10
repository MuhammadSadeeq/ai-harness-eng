"""The run: ENGINE.md section 7.1 line by line, with sections 7.2 to 7.7 and the amendments.

Every event's `t` and `turn` are the values at the moment it is emitted, so the order of the
`t +=` lines relative to `emit` matters; it follows the pseudocode exactly.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from .board import Board, BoardError
from .inputs import check_input
from .model import (
    CallContext,
    ErrorOutcome,
    Reply,
    ScriptedModel,
    ToolUse,
    _string_values,
    missing_results,
)
from .policy import NO_POLICY, Approver, Policy
from .pricing import Prices
from .prng import Mulberry32
from .pyjson import pyjson
from .spec import (
    DEFAULT_EFFORT,
    ERROR_MESSAGES,
    LOST_REPLY_OUTPUT,
    MISSING_RESULT_MESSAGE,
    MODEL_ERROR_MS,
    OUTPUT_CAP_MARKER,
    RUN_AGENT_DEF,
    RUN_AGENT_LATENCY_MS,
    RUN_AGENT_NAME,
    SAFETY_TURNS,
    SESSION_HANDOFF,
    TIMED_OUT_PREFIX,
    TOOL_SEARCH_DEF,
    TOOL_SEARCH_LATENCY_MS,
    TOOL_SEARCH_MAX,
    TOOL_SEARCH_NAME,
    TRANSIENT,
)
from .tape import Tape
from .tokens import tokens
from .tools import Toolbox, cat_path, text_field
from .trace import Recorder
from .vfs import egress_reason, sandbox_reason
from .wire import request_payload, response_payload

_CONTINUE = "<continue>"


@dataclass(frozen=True)
class RunResult:
    status: str
    passed: bool
    turns: int
    tokens_in: int
    tokens_out: int
    cost: int
    events: list[dict[str, Any]]
    wire: list[dict[str, Any]]
    choices: list[tuple[str, int]]  # A3.22: [location of the branch step, option], in order


def text_block(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def user_message(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"role": "user", "content": blocks}


def tool_result(tool_use_id: str, content: str, is_error: bool) -> dict[str, Any]:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": content,
        "is_error": is_error,
    }


def model_choice(tape: Tape, board: Board) -> tuple[str, dict[str, Any] | None]:
    """A14.5: the model id and its profile. Profiles apply only through the model module; without
    it the tape's own model id and pricing stand, and there is no profile."""
    if not board.has("model"):
        return tape.model_id, None
    model_id = str(board.param("model", "id"))
    if model_id not in tape.models:
        raise BoardError(f"model {model_id!r} is not a profile of tape {tape.id!r} (A14.5)")
    return model_id, tape.models[model_id]


def run_pricing(tape: Tape, board: Board) -> dict[str, Any]:
    """The pricing the run uses: the profile's, when the model module selects one (A14.5)."""
    _, profile = model_choice(tape, board)
    return dict(tape.pricing) if profile is None else dict(profile["pricing"])


def _reply_text(reply: Reply) -> str:
    """A14.1: a reply's text blocks joined by a newline (the sub-agent's answer)."""
    return "\n".join(str(block["text"]) for block in reply.content if block.get("type") == "text")


# A14.1: the attributes a sub-agent swaps in for its own run (A15.1 says which modules apply).
SWAPPED = (
    "messages",
    "turn",
    "turn_base",
    "model",
    "consecutive_failures",
    "feedback_count",
    "feedback_pending",
    "last_permission",
    "last_truncated",
    "recent_calls",
    "compacted",
    "agent",
    "scope",
    "system_base",
    "progress_layer",
    "last_text",
    "max_turns",
    "has_turn_limit",
    "has_verify",
    "has_loop",
    "has_budget",
    "has_search",
    "has_subagents",
    "has_compaction",
    "has_cache",
    "has_clock",
    "has_rules_file",
    "has_split",
    "first_block_only",
    "resend",
    "has_close_books",
)


class Harness:
    def __init__(self, tape: Tape, board: Board, seed: int, prices: Prices) -> None:
        self.tape = tape
        self.board = board
        self.seed = seed
        self.prices = prices
        self.rng = Mulberry32(seed)
        patterns: list[str] = []
        if board.has("redact"):
            patterns = [str(p) for p in board.param("redact", "patterns")]
        self.rec = Recorder(f"{tape.id}:{board.id}:{seed}", patterns)
        # A11.5: the tools whose server the board does not pin, or whose version differs.
        self.rejected: dict[str, tuple[str, str, str]] = {}  # tool -> (server, version, reason)
        pins = dict(board.param("tool_pins", "pins")) if board.has("tool_pins") else None
        for custom in tape.custom_tools:
            if "server" not in custom or pins is None:
                continue
            server, version = str(custom["server"]), str(custom["version"])
            if server not in pins:
                reason = f"server not pinned: {server}"
            elif str(pins[server]) != version:
                reason = f"version {version} is not the pinned {pins[server]}"
            else:
                continue
            self.rejected[str(custom["name"])] = (server, version, reason)
        self.toolbox = Toolbox(tape, frozenset(self.rejected))
        self.choices: list[tuple[str, int]] = []  # A3.22: shared by every script of the run
        self.model_id, profile = model_choice(tape, board)  # A14.5
        self.rejects: list[str] = [str(n) for n in profile.get("rejects", [])] if profile else []
        main_script = list(tape.script)
        if profile is not None and "script" in profile:  # A14.5: the profile's, else the tape's
            if tape.sessions:
                raise BoardError("a model profile's script cannot replace sessions (A14.5)")
            main_script = list(profile["script"])
        self.request_params: dict[str, Any] = (  # A14.5: added to every request
            dict(board.modules["request_params"]) if board.has("request_params") else {}
        )
        self.has_capability = board.has("capability_check")
        rejected_params = [name for name in self.request_params if name in self.rejects]
        self.dropped: list[str] = rejected_params if self.has_capability else []
        self.blocked: list[str] = [] if self.has_capability else rejected_params
        self.session_scripts: list[list[dict[str, Any]]] = [list(s) for s in tape.sessions]
        self.session = 1  # A14.2: from 1; a tape without sessions is session 1 throughout
        self.session_script: list[dict[str, Any]] = main_script
        self.session_prefix = "/script"
        self.model = self._new_model()
        self.system_base = tape.system  # A14.1: a sub-agent may have its own
        self.agent = "main"  # A14.4: the events' agent label (a sub-agent's is name#k)
        self.scope = ""  # A14.1: the id scope of a sub-agent's tool uses and replies
        self.turn_base = 0  # A14.2: the turn a session started on; turn_limit counts from it
        self.progress_path: str | None = (  # A14.2
            str(board.param("progress_file", "path")) if board.has("progress_file") else None
        )
        self.progress_layer: str | None = None
        self.crash_turn: int | None = int(tape.crash["turn"]) if tape.crash is not None else None
        self.crashed = False  # A14.3: once per run
        self.has_durable = board.has("durable_session")
        self.has_subagents = board.has("subagents")  # A14.1
        self.subagent_context = (
            str(board.param("subagents", "context")) if self.has_subagents else ""
        )
        self.subagent_max = int(board.param("subagents", "max")) if self.has_subagents else 0
        self.subagent_max_turns = (
            int(board.param("subagents", "max_turns")) if self.has_subagents else 0
        )
        self.started = 0  # the sub-agents started in the run (never reset)
        self.has_tool_retry = board.has("tool_retry")  # A14.4
        self.tool_attempts = (
            int(board.param("tool_retry", "max_attempts")) if self.has_tool_retry else 1
        )
        self.has_idempotency = board.has("idempotency")
        self.keys: dict[str, str] = {}  # the tool's keys: tool_use_id -> the first output
        self.applied: dict[str, int] = {}  # the tool's real applications, by tool name
        self.live_custom: dict[str, dict[str, Any]] = {
            str(c["name"]): c for c in tape.custom_tools if str(c["name"]) not in self.rejected
        }
        self.last_text = ""
        self.approver = Approver.from_config(tape.human)
        self.policy: Policy | None = (
            Policy.from_params(board.modules["permissions"]) if board.has("permissions") else None
        )
        self.has_rules_file = board.has("rules_file")
        self.has_close_books = board.has("close_books")
        self.has_verify = board.has("verify_gate")
        self.max_feedback = (
            int(board.param("verify_gate", "max_feedback")) if self.has_verify else 0
        )
        self.has_turn_limit = board.has("turn_limit")
        self.max_turns = int(board.param("turn_limit", "max_turns")) if self.has_turn_limit else 0
        self.has_budget = board.has("token_budget")
        self.budget = int(board.param("token_budget", "max_tokens")) if self.has_budget else 0
        self.has_loop = board.has("loop_detect")
        self.loop_window = int(board.param("loop_detect", "window")) if self.has_loop else 0
        self.has_cap = board.has("output_cap")
        self.cap_max = int(board.param("output_cap", "max_tokens")) if self.has_cap else 0
        self.has_retry = board.has("retry")
        self.has_breaker = board.has("breaker")
        self.breaker_threshold = int(board.param("breaker", "threshold")) if self.has_breaker else 0
        self.has_sandbox = board.has("sandbox")
        self.egress: list[str] = []
        if self.has_sandbox:
            self.egress = [str(h) for h in board.modules["sandbox"].get("egress", [])]
        self.messages: list[dict[str, Any]] = []
        self.t = 0
        self.turn = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.cost = 0
        self.consecutive_failures = 0
        self.feedback_count = 0
        self.last_permission: str | None = None
        self.recent_calls: list[str] = []
        self.last_truncated = False
        self.feedback_pending = False
        self.wire: list[dict[str, Any]] = []
        # A5: history {"resend": false} sends only the task; first_block_only reads content[0] only.
        self.resend = bool(board.param("history", "resend")) if board.has("history") else True
        self.first_block_only = board.has("first_block_only")
        # A6 and A7: absent modules change nothing.
        self.notes = list(tape.notes)
        self.has_compaction = board.has("compaction")
        self.compaction_percent = (
            int(board.param("compaction", "threshold_percent")) if self.has_compaction else 0
        )
        self.compaction_keep = (
            frozenset(board.param("compaction", "keep")) if self.has_compaction else frozenset()
        )
        self.has_clock = board.has("system_clock")
        self.has_cache = board.has("cache")
        if self.has_cache and (
            tape.cache_rules is None
            or prices.cache_write_milli is None
            or prices.cache_read_milli is None
        ):
            raise BoardError(
                "the cache module needs cache_rules and cache prices on the tape (A6.5)"
            )
        self.cache_rules = tape.cache_rules
        self.cache_map: dict[str, int] = {}
        self.has_validate = board.has("validate_inputs")
        self.has_split = board.has("split_results")
        self.has_effort_board = board.has("effort")
        board_level = board.param("effort", "level") if self.has_effort_board else None
        tape_default = tape.effort.get("default") if tape.effort is not None else None
        self.level = str(board_level or tape_default or DEFAULT_EFFORT)  # A7.3
        table = tape.effort.get("thinking_tokens") if tape.effort is not None else None
        # A8.3: a level the table leaves out adds 0.
        self.thinking = int(table.get(self.level, 0)) if table is not None else 0
        # A9: tool overrides, tools on demand, the test suite, and cost attribution.
        defined = set(tape.tools) | {str(c["name"]) for c in tape.custom_tools}
        self.overrides: dict[str, dict[str, Any]] = {
            name: dict(value) for name, value in board.modules.get("tool_overrides", {}).items()
        }
        self.has_search = board.has("tool_search")
        self.always: list[str] = (
            [str(n) for n in board.param("tool_search", "always")] if self.has_search else []
        )
        for name in [*self.overrides, *self.always]:
            if name not in defined:
                raise BoardError(f"{name!r} is not a tool of this tape (A9.1)")
        if self.has_search and TOOL_SEARCH_NAME in defined:  # A10.2
            raise BoardError("the tape defines its own tool_search; the module's is the harness's")
        self.loaded: set[str] = set()
        self.tests = list(tape.tests)
        self.pristine = (
            bool(board.modules["verify_gate"].get("pristine_tests", False))
            if board.has("verify_gate")
            else False
        )
        self.has_cost = board.has("cost_attribution")
        self.compacted = False

    # ---- the run -------------------------------------------------------------------------

    def run(self) -> RunResult:
        self._emit(
            "run_start",
            task=self.tape.task,
            board=self.board.id,
            seed=self.seed,
            model_id=self.model_id,
        )
        for name, (server, version, reason) in self.rejected.items():  # A11.5: after run_start
            self._emit("tool_rejected", tool=name, server=server, version=version, reason=reason)
        if self.has_capability:  # A14.5: once per run, after the tool_rejected events (A16.6)
            self._emit("capability", dropped=list(self.dropped))
        if self.session_scripts:  # A14.2: the sessions in order, while each hands over
            status = "error"
            for number, script in enumerate(self.session_scripts, start=1):
                self._start_session(number, script)
                status = self._loop()
                if status not in SESSION_HANDOFF:
                    break
        else:
            self.messages = [user_message([text_block(self.tape.task)])]
            status = self._loop()
        passed = self._finish(status)
        return RunResult(
            status=status,
            passed=passed,
            turns=self.turn,
            tokens_in=self.tokens_in,
            tokens_out=self.tokens_out,
            cost=self.cost,
            events=list(self.rec.events),
            wire=list(self.wire),
            choices=list(self.choices),
        )

    def _loop(self) -> str:
        while True:
            stop = self._guards()
            if stop is not None:
                return stop
            if self._crash_due():  # A14.3: after turn n's results, before the next model call
                self._crash()
            self.turn += 1
            self.compacted = False
            if self.has_compaction:  # A6.3: after the guards and turn += 1, before the control wire
                self._compact()

            request = self._request()
            prompt_tokens = tokens(request)
            self._emit("prompt_built", layers=self._layers(), tokens=prompt_tokens)

            window = self.tape.window
            over = prompt_tokens > window
            self._emit(
                "context_check",
                tokens=prompt_tokens,
                window=window,
                percent=(100 * prompt_tokens) // window,
                action="overflow" if over else ("compacted" if self.compacted else "none"),
            )
            if over:  # A1: a permanent error, before any call
                self._permanent_error(
                    prompt_tokens,
                    f"prompt is too long: {prompt_tokens} tokens > {window} maximum",
                )
                return "error"

            result = self._call(prompt_tokens, request)
            if isinstance(result, str):
                return result
            reply = result
            self.last_text = _reply_text(reply)
            read, write, uncached = 0, 0, prompt_tokens
            if self.has_cache:  # A6.5: after recovery_check, before model_reply
                read, write, uncached, matched, hit = self._cache_step(prompt_tokens, request)
                self._emit(
                    "cache",
                    read=read,
                    write=write,
                    uncached=uncached,
                    matched=matched,
                    hit_percent=hit,
                )
            self.t += reply.latency_ms
            self.tokens_in += prompt_tokens
            self.tokens_out += reply.output_tokens
            self.cost += (
                uncached * self.prices.input_milli
                + write * (self.prices.cache_write_milli or 0)
                + read * (self.prices.cache_read_milli or 0)
                + reply.output_tokens * self.prices.output_milli
            )
            self.messages.append({"role": "assistant", "content": reply.content})
            payload = response_payload(
                f"{self.scope}{self.turn}",
                self.model_id,
                reply.content,
                reply.stop_reason,
                prompt_tokens,
                reply.output_tokens,
            )
            # A8.4: the response usage has exactly the fields of model_reply.usage.
            payload["usage"] = self._usage(prompt_tokens, reply, read, write, uncached)
            self.wire.append(payload)
            self._emit(
                "model_reply",
                stop_reason=reply.stop_reason,
                text=reply.say if reply.say is not None else "",
                tool_uses=[{"id": u.id, "name": u.name, "input": u.input} for u in reply.tool_uses],
                usage=self._usage(prompt_tokens, reply, read, write, uncached),
                cost=self.cost,
            )

            if self.has_cost:  # A9.4: after each model_reply
                self._emit_cost(request, reply, uncached, read, write)
            calls = self._read_calls(reply)  # A5.5(b): an interrupt needs a call the harness read
            interrupt = self.tape.interrupt
            if (
                interrupt is not None
                and self.agent == "main"  # the tape's interrupt is the run's (A14.1 keeps it)
                and int(interrupt["turn"]) == self.turn
                and calls
            ):
                stop = self._interrupt(reply, bool(interrupt.get("resume", False)))
                if stop == _CONTINUE:
                    continue
                return stop

            if reply.stop_reason == "tool_use" and (calls or not self.first_block_only):
                self._run_tools(calls)
                continue

            # A5: a tool_use reply with no call found takes the end_turn branch, as the bug does.
            if reply.stop_reason == "end_turn" or (
                reply.stop_reason == "tool_use" and self.first_block_only
            ):
                if self.has_verify:
                    passed = self._gate_holds()
                    output = self.tape.test_output["pass" if passed else "fail"]
                    label = "tests (pristine)" if self.pristine and self.tests else "tests"
                    self._emit("verify", check=label, passed=passed, output=output)
                    if passed:
                        return "done"
                    if self.feedback_count < self.max_feedback:
                        self.feedback_count += 1
                        feedback = (
                            "Verification failed: "
                            + self.tape.test_output["fail"]
                            + " Fix it, then say done."
                        )
                        self.messages.append(user_message([text_block(feedback)]))
                        self.feedback_pending = True
                        self._trace_write()
                        continue
                    return "unverified"
                return "done"  # a done claim; the ground truth is run_end.passed

            if reply.stop_reason == "max_tokens":
                return "max_tokens_reply"
            if reply.stop_reason == "refusal":
                return "refused"
            return "error"

    def _finish(self, status: str) -> bool:
        if self.rec.pending > 0:
            self._trace_write()
        passed = self.toolbox.checks_hold()
        self._emit(
            "run_end",
            status=status,
            passed=passed,
            turns=self.turn,
            tokens={"input": self.tokens_in, "output": self.tokens_out},
            cost=self.cost,
        )
        return passed

    # ---- guards (section 7.1, loop wire) ---------------------------------------------------

    def _guards(self) -> str | None:
        turns_here = self.turn - self.turn_base  # A14.2: turn_limit counts the session's turns
        if self.has_turn_limit and turns_here >= self.max_turns:
            self._emit("guard", guard="max_turns", limit=self.max_turns, value=turns_here)
            return "max_turns"
        if self.has_budget:
            used = self.tokens_in + self.tokens_out
            if used >= self.budget:
                self._emit("guard", guard="budget", limit=self.budget, value=used)
                return "budget"
        if self.has_loop and len(self.recent_calls) >= self.loop_window:
            last = self.recent_calls[-self.loop_window :]
            if all(call == last[0] for call in last):
                self._emit("guard", guard="loop", limit=self.loop_window, value=self.loop_window)
                return "loop"
        if self.turn >= SAFETY_TURNS:
            self._emit("interrupt", by="operator", pending=[])
            return "interrupted"
        return None

    # ---- control wire ----------------------------------------------------------------------

    def _sent(self) -> list[dict[str, Any]]:
        """A5: without resend, every request carries the first message only (the task)."""
        return list(self.messages) if self.resend else self.messages[:1]

    def _read_calls(self, reply: Reply) -> list[ToolUse]:
        """A5 first_block_only: the harness reads a tool call only from content[0]."""
        if not self.first_block_only:
            return list(reply.tool_uses)
        if reply.content and reply.content[0].get("type") == "tool_use":
            return [reply.tool_uses[0]]
        return []

    # ---- A6 and A7 (absent modules change nothing) -----------------------------------------

    def _compact(self) -> None:
        """A6.3: the compactor. No model call and no cost; it changes the harness's own history.

        A8.1: with history resend false it is inert, whatever its threshold.
        """
        if not self.resend:
            return
        before = tokens(self._request())
        if not (
            100 * before > self.compaction_percent * self.tape.window
            and len(self.messages) >= 5
            and self.messages[-1]["role"] == "user"
        ):
            return
        kept = [
            note
            for note in self.notes
            if note["turn"] < self.turn and note["kind"] in self.compaction_keep
        ]
        lines = ["\n- " + note["kind"] + ": " + note["text"] for note in kept] or [
            "\n- (nothing kept)"
        ]
        summary = "Summary of the work so far:" + "".join(lines)
        dropped = len(self.messages) - 2
        self.messages = [user_message([text_block(summary)])] + self.messages[-2:]
        self.compacted = True
        self._emit(
            "compaction",
            tokens_before=before,
            tokens_after=tokens(self._request()),
            dropped_messages=dropped,
            kept_notes=[note["id"] for note in kept],
        )

    def _cache_step(
        self, prompt_tokens: int, request: dict[str, Any]
    ) -> tuple[int, int, int, str, int]:
        """A6.5: this call's cache read and write, the cached part's label, and the hit percent."""
        rules = self.cache_rules
        assert rules is not None  # the constructor refuses cache without cache_rules
        if prompt_tokens < rules["min_tokens"]:
            return 0, 0, prompt_tokens, "none", 0  # too short to cache: the map is not touched
        t_call = self.t
        system, tools, sent = request["system"], request["tools"], request["messages"]
        prefixes: list[dict[str, Any]] = [{"tools": tools}, {"system": system, "tools": tools}]
        for j in range(1, len(sent) + 1):
            prefixes.append({"system": system, "tools": tools, "messages": sent[0:j]})
        keys = [pyjson(prefix) for prefix in prefixes]  # keys[k - 1] is key(k)
        found = 0
        for k in range(len(keys), 0, -1):
            written = self.cache_map.get(keys[k - 1])
            if written is not None and t_call - written < rules["ttl_ms"]:
                found = k
                break
        read = tokens(prefixes[found - 1]) if found > 0 else 0
        write = prompt_tokens - read
        if found > 0:
            self.cache_map[keys[found - 1]] = t_call
        self.cache_map[keys[-1]] = t_call
        if found == 0:
            matched = "none"
        elif found == 1:
            matched = "tools"
        elif found == 2:
            matched = "system"
        else:
            matched = f"messages[{found - 3}]"
        return read, write, prompt_tokens - read - write, matched, (100 * read) // prompt_tokens

    def _usage(
        self, prompt_tokens: int, reply: Reply, read: int, write: int, uncached: int
    ) -> dict[str, Any]:
        """model_reply.usage: cache fields with cache plugged, thinking with an effort block."""
        if self.has_cache:
            usage: dict[str, Any] = {
                "input_tokens": uncached,
                "cache_creation_input_tokens": write,
                "cache_read_input_tokens": read,
                "output_tokens": reply.output_tokens,
            }
        else:
            usage = {"input_tokens": prompt_tokens, "output_tokens": reply.output_tokens}
        if self.tape.effort is not None:  # A7.3
            usage["output_tokens_details"] = {"thinking_tokens": self.thinking}
        return usage

    def _wire_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """The request payload. The breakpoint (A6.5) and output_config (A7.3): wire only."""
        output_config = {"effort": self.level} if self.has_effort_board else None
        payload = copy.deepcopy(
            request_payload(
                self.model_id,
                str(request["system"]),
                list(request["tools"]),
                list(request["messages"]),
                output_config=output_config,
            )
        )
        if self.has_cache and payload["messages"]:
            payload["messages"][-1]["content"][-1]["cache_control"] = {"type": "ephemeral"}
        for name, value in self.request_params.items():  # A14.5: dropped params are not sent
            if name not in self.dropped:
                payload[name] = value
        return payload

    def _input_reason(self, call: ToolUse) -> str:
        """A7.1: the reason the call's input is invalid, or "" (an unknown tool is not checked)."""
        if self.has_subagents and call.name == RUN_AGENT_NAME:  # A14.1: checked as usual
            return check_input(call.input, RUN_AGENT_DEF["input_schema"])
        if self.has_search and call.name == TOOL_SEARCH_NAME:
            return check_input(call.input, TOOL_SEARCH_DEF["input_schema"])
        for definition in self._effective_defs():
            if definition["name"] == call.name:
                return check_input(call.input, definition["input_schema"])
        return ""

    # ---- A9: tool overrides, tools on demand, the test suite, cost attribution ----------------

    def _effective_defs(self) -> list[dict[str, Any]]:
        """The tape's definitions with the overrides applied (A9.1), in A3.1 order."""
        defs = self.toolbox.definitions()
        for definition in defs:
            override = self.overrides.get(str(definition["name"]), {})
            if "description" in override:
                definition["description"] = override["description"]
            if "input_schema" in override:
                definition["input_schema"] = copy.deepcopy(override["input_schema"])
        return defs

    def _tool_defs(self) -> list[dict[str, Any]]:
        """What the request carries (A9.2): the always tools, the loaded tools in A3.1 order, then
        tool_search. Without the module, every tool."""
        defs = self._effective_defs()
        if not self.has_search:
            return self._with_run_agent(defs)
        always = [d for d in defs if str(d["name"]) in self.always]  # A10.3: A3.1 order
        loaded = [
            d for d in defs if str(d["name"]) in self.loaded and str(d["name"]) not in self.always
        ]
        return self._with_run_agent([*always, *loaded, copy.deepcopy(TOOL_SEARCH_DEF)])

    def _with_run_agent(self, defs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """A14.1 and A15.10: run_agent comes last, after tool_search."""
        if not self.has_subagents:
            return defs
        return [*defs, copy.deepcopy(RUN_AGENT_DEF)]

    def _search(self, tool_input: dict[str, Any]) -> tuple[bool, str, int]:
        """A9.2 and A10.4-5: the tools whose name and definition, as sent, hold every word of the
        query, in A3.1 order. Unloaded matches load, at most five. A query with no words matches
        nothing. When every match is already loaded (always tools count), nothing new loads."""
        query = text_field(tool_input, "query")
        words = query.lower().split()
        matches: list[str] = []
        if words:
            for definition in self._effective_defs():
                name = str(definition["name"])
                haystack = (name + " " + str(definition["description"])).lower()
                if all(word in haystack for word in words):
                    matches.append(name)
        if not matches:
            return False, f"No tool matched: {query}", TOOL_SEARCH_LATENCY_MS
        held = set(self.loaded) | set(self.always)
        new = [name for name in matches if name not in held][:TOOL_SEARCH_MAX]
        if not new:
            return True, "Already loaded: " + ", ".join(matches), TOOL_SEARCH_LATENCY_MS
        self.loaded.update(new)
        return True, "Loaded: " + ", ".join(new), TOOL_SEARCH_LATENCY_MS

    def _gate_holds(self) -> bool:
        """The verify gate: the suite when the tape has one (A9.3), else the checks (A3.5)."""
        if self.tests:
            return self.toolbox.suite_holds(pristine=self.pristine)
        return self.toolbox.checks_hold()

    def _emit_cost(
        self, request: dict[str, Any], reply: Reply, uncached: int, read: int, write: int
    ) -> None:
        """A9.4: this call's cost split, and the largest part by tokens (ties: the earliest)."""
        input_cost = uncached * self.prices.input_milli
        output_cost = reply.output_tokens * self.prices.output_milli
        cache_cost = write * (self.prices.cache_write_milli or 0) + read * (
            self.prices.cache_read_milli or 0
        )
        parts: list[tuple[str, int]] = [
            ("system", tokens(request["system"])),
            ("tools", tokens(request["tools"])),
        ]
        parts += [
            (f"messages[{k}]", tokens(message)) for k, message in enumerate(request["messages"])
        ]
        top_part, top_tokens = parts[0]
        for name, size in parts[1:]:
            if size > top_tokens:
                top_part, top_tokens = name, size
        self._emit(
            "cost",
            call_cost=input_cost + output_cost + cache_cost,
            input_cost=input_cost,
            output_cost=output_cost,
            cache_cost=cache_cost,
            top_part=top_part,
            top_tokens=top_tokens,
        )

    def _layers(self) -> list[str]:
        layers = ["clock", "system"] if self.has_clock else ["system"]
        if self.has_rules_file and self.tape.rules:
            layers.append("rules")
        if self.progress_layer is not None:  # A14.2: after rules
            layers.append("progress")
        layers.extend(["tools", "history" if self.resend else "history (not resent)"])
        return layers

    def _system(self) -> str:
        system = self.system_base
        if self.has_rules_file and self.tape.rules:
            system += "\n\nProject rules:\n- " + "\n- ".join(self.tape.rules)
        if self.progress_layer is not None:  # A14.2: the progress note, read at session start
            system += "\n\n" + self.progress_layer
        if self.has_clock:  # A6.4: the time at the top of the prompt, a bug on purpose
            system = "Current time: t=" + str(self.t) + " ms\n\n" + system
        return system

    def _request(self) -> dict[str, Any]:
        return {
            "system": self._system(),
            "tools": self._tool_defs(),
            "messages": self._sent(),
        }

    # ---- permanent errors (A1, A3.16) -------------------------------------------------------

    def _permanent_error(self, prompt_tokens: int, message: str) -> None:
        """model_call(attempt=1), t += 300, model_error. Never retried, never the breaker, and
        no wire payload."""
        self._emit("model_call", attempt=1, tokens_in=prompt_tokens)
        self.t += MODEL_ERROR_MS
        self._emit(
            "model_error",
            type="invalid_request",
            attempt=1,
            retry_after_ms=0,
            message=message,
        )

    # ---- the call with recovery (loop and errors wires) -------------------------------------

    def _call(self, prompt_tokens: int, request: dict[str, Any]) -> Reply | str:
        if missing_results(self.messages):  # A3.16: before the outage and fault checks
            self._permanent_error(prompt_tokens, MISSING_RESULT_MESSAGE)
            return "error"
        if self.blocked:  # A14.5: a param this model rejects, and no capability check to drop it
            message = f"{self.blocked[0]}: this parameter is not supported on {self.model_id}"
            self._permanent_error(prompt_tokens, message)
            return "error"
        attempt = 0
        while True:
            attempt += 1
            self._emit("model_call", attempt=attempt, tokens_in=prompt_tokens)
            outcome = self.model.call(self._context(prompt_tokens, request))
            if isinstance(outcome, ErrorOutcome):
                self.t += outcome.error_ms
                self.consecutive_failures += 1
                self._emit(
                    "model_error",
                    type=outcome.type,
                    attempt=attempt,
                    retry_after_ms=outcome.retry_after_ms,
                    message=ERROR_MESSAGES[outcome.type],
                )
                if self.has_breaker and self.consecutive_failures >= self.breaker_threshold:
                    self._emit("breaker", state="open", failures=self.consecutive_failures)
                    return "circuit_open"
                if (
                    self.has_retry
                    and attempt < int(self.board.param("retry", "max_attempts"))
                    and outcome.type in TRANSIENT
                ):
                    wait = self._backoff(attempt, outcome.retry_after_ms)
                    self._emit("retry_wait", attempt=attempt, wait_ms=wait)
                    self.t += wait
                    continue
                return "error"
            self.consecutive_failures = 0
            self._emit(
                "recovery_check",
                attempts=attempt,
                breaker="closed" if self.has_breaker else "none",
            )
            self.wire.append(self._wire_request(request))
            return outcome

    def _backoff(self, attempt: int, retry_after_ms: int) -> int:
        base_ms = int(self.board.param("retry", "base_ms"))
        cap_ms = int(self.board.param("retry", "cap_ms"))
        base = min(cap_ms, base_ms * 2 ** (attempt - 1))
        wait = self.rng.below(base + 1) if self.board.param("retry", "jitter") == "full" else base
        return max(wait, retry_after_ms)

    def _context(self, prompt_tokens: int, request: dict[str, Any]) -> CallContext:
        return CallContext(
            turn=self.turn,
            t=self.t,
            messages=self.messages,
            last_permission=self.last_permission,
            last_truncated=self.last_truncated,
            feedback_pending=self.feedback_pending,
            sent=self._sent(),
            request=request,
            prompt_tokens=prompt_tokens,
            window=self.tape.window,
            level=self.level,
            thinking=self.thinking,
            session=self.session,
            scope=self.scope,
        )

    # ---- interrupts (section 7.6, A3.17) ----------------------------------------------------

    def _interrupt(self, reply: Reply, resume: bool) -> str:
        pending = [call.id for call in self._read_calls(reply)]
        self._emit("interrupt", by="human", pending=pending)
        if self.has_close_books:
            self.messages.append(
                user_message(
                    [
                        tool_result(tool_id, "Interrupted by the user before this ran.", True)
                        for tool_id in pending
                    ]
                )
            )
            self.feedback_pending = False
        if not resume:
            return "interrupted"
        self._trace_write()  # A3.17: the turn ends with trace_write, then the next turn's guards
        return _CONTINUE

    # ---- tools and permissions (section 7.1, tool turns) ------------------------------------

    def _run_tools(self, calls: list[ToolUse]) -> None:
        results: list[dict[str, Any]] = []
        for call in calls:
            results.append(self._one_tool(call))
        if self.has_split:  # A7.2: one user message per result, in call order (a bug on purpose)
            for result in results:
                self.messages.append(user_message([result]))
        else:
            self.messages.append(user_message(results))
        self.feedback_pending = False
        self._trace_write()

    def _one_tool(self, call: ToolUse) -> dict[str, Any]:
        if self.policy is None:
            decision, rule, reason = NO_POLICY
        else:
            decision, rule, reason = self.policy.decide(call.name, call.input)
        human: str | None = None
        if decision == "ask":
            human = self.approver.answer(call.input, self.rng)
            final = "allow" if human == "approve" else "deny"
        else:
            final = decision
        self._emit(
            "permission",
            tool=call.name,
            decision=decision,
            rule=rule,
            reason=reason,
            human=human,
            final=final,
            tool_use_id=call.id,
        )
        self.last_permission = final
        if final == "deny":
            return tool_result(call.id, "Denied: " + reason, True)
        if self.has_sandbox:
            allowed, why = self._sandbox(call)
            self._emit("sandbox", tool=call.name, allowed=allowed, reason=why, tool_use_id=call.id)
            if not allowed:
                return tool_result(call.id, "Blocked by the sandbox: " + why, True)
        if self.has_validate:  # A7.1: the input against the tool's schema, before the run
            reason = self._input_reason(call)
            self._emit(
                "input_check",
                tool=call.name,
                valid=reason == "",
                reason=reason,
                tool_use_id=call.id,
            )
            if reason:
                return tool_result(call.id, "Invalid input: " + reason, True)
        attempt = 0
        while True:  # A14.4 (A15.8): a retry repeats only the tool's run, never the checks above
            attempt += 1
            ok, output, latency = self._run_once(call)
            shown, truncated = self._cap(output)
            self.t += latency
            fields: dict[str, Any] = {
                "tool": call.name,
                "input": call.input,
                "ok": ok,
                "output": shown,
                "output_tokens": tokens(shown),
                "truncated": truncated,
                "tool_use_id": call.id,
            }
            if self.has_tool_retry:  # the attempt, when the module is plugged
                fields["attempt"] = attempt
            self._emit("tool_call", **fields)
            self.last_truncated = truncated
            again = (
                self.has_tool_retry
                and call.name != RUN_AGENT_NAME  # A16.6: a sub-agent's result is not retried
                and shown.startswith(TIMED_OUT_PREFIX)
                and attempt < self.tool_attempts
            )
            if not again:
                break
        self._leak_check(call)
        self.recent_calls.append(call.name + " " + pyjson(call.input))
        return tool_result(call.id, shown, not ok)

    def _run_once(self, call: ToolUse) -> tuple[bool, str, int]:
        """One run of a tool: its own result and its time (A9.2, A14.1, A14.4)."""
        if self.has_search and call.name == TOOL_SEARCH_NAME:
            return self._search(call.input)
        if self.has_subagents and call.name == RUN_AGENT_NAME:
            return self._run_agent(call.input)
        custom = self.live_custom.get(call.name)
        if custom is not None:
            return self._apply_custom(custom, call)
        return self.toolbox.run(call.name, call.input)

    def _apply_custom(self, custom: dict[str, Any], call: ToolUse) -> tuple[bool, str, int]:
        """A14.4: a custom tool's run. A ledger tool appends its input to its ledger file; its
        lose_reply numbers lose the reply of those applications; with idempotency a ledger
        tool applies each key once, and a repeated key returns the first output with ok true."""
        name = str(custom["name"])
        ok, output, latency = self.toolbox.run(name, call.input)
        ledger = custom.get("ledger")
        keyed = self.has_idempotency and ledger is not None
        if keyed and call.id in self.keys:
            return True, self.keys[call.id], latency
        applied = self.applied.get(name, 0) + 1
        self.applied[name] = applied
        if ledger is not None:
            self.toolbox.append_ledger(str(ledger), pyjson(call.input) + "\n")
        if keyed:  # A16.1: the output the tool produced, before a lost reply replaces it
            self.keys[call.id] = output
        if applied in custom.get("lose_reply", []):
            ok, output = False, LOST_REPLY_OUTPUT
        return ok, output, latency

    def _leak_check(self, call: ToolUse) -> None:
        """A11.3: a network custom tool that ran, with a canary inside its input, leaks."""
        if not self.tape.canaries or call.name in self.rejected:
            return
        custom = next((c for c in self.tape.custom_tools if c["name"] == call.name), None)
        if custom is None or custom.get("effect") != "network":
            return
        values = list(_string_values(call.input))
        found = [c for c in self.tape.canaries if any(c in value for value in values)]
        if found:
            self._emit("leak", tool=call.name, canaries=found, tool_use_id=call.id)

    def _sandbox(self, call: ToolUse) -> tuple[bool, str]:
        """A3.8: paths of read, write, edit and `cat <path>`; then the egress of network tools."""
        paths: list[str] = []
        if call.name in ("read_file", "write_file", "edit_file"):
            paths.append(text_field(call.input, "path"))
        if call.name == "run_command":
            found = cat_path(text_field(call.input, "cmd"))
            if found is not None:
                paths.append(found)
        for path in paths:
            reason = sandbox_reason(self.toolbox.vfs.resolve(path))
            if reason is not None:
                return False, reason
        # A12.1: a rejected tool is an unknown tool here too: no effect, so no egress check.
        custom = next(
            (
                c
                for c in self.tape.custom_tools
                if c["name"] == call.name and call.name not in self.rejected
            ),
            None,
        )
        if custom is not None and custom.get("effect") == "network":
            url = call.input.get("url")
            if isinstance(url, str):
                reason = egress_reason(url, self.egress)
                if reason is not None:
                    return False, reason
        return True, ""

    def _cap(self, output: str) -> tuple[str, bool]:
        """A3.18: cut only when tokens > max and length > 4 * max."""
        if not self.has_cap:
            return output, False
        limit = self.cap_max
        if tokens(output) <= limit or len(output) <= 4 * limit:
            return output, False
        removed = len(output) - 4 * limit
        marker = OUTPUT_CAP_MARKER.format(n=removed)
        shown = output[: 2 * limit] + marker + output[len(output) - 2 * limit :]
        return shown, True

    # ---- sessions, crash and resume (A14.2, A14.3) ---------------------------------------------

    def _new_model(self) -> ScriptedModel:
        """A script's cursor at its start; the choices list is shared by the whole run."""
        return ScriptedModel(
            self.tape, self.rng, self.session_script, self.session_prefix, self.choices
        )

    def _start_session(self, number: int, script: list[dict[str, Any]]) -> None:
        """A14.2: a session starts with the task alone; the loop's counts reset (A15.5); its
        progress note is read here, from session 2 on (A15.5, A15.9)."""
        self.session = number
        self.turn_base = self.turn
        self.recent_calls = []
        self.consecutive_failures = 0
        self.feedback_count = 0
        self.feedback_pending = False
        self.messages = [user_message([text_block(self.tape.task)])]
        self.session_script = script
        self.session_prefix = f"/sessions/{number - 1}/script"
        self.model = self._new_model()
        if number >= 2:
            self.progress_layer = self._read_progress()
        self._emit("session_start", session=number)

    def _read_progress(self) -> str | None:
        """The progress layer (A14.2): the file's content, or None without the module or file."""
        if self.progress_path is None:
            return None
        entry = self.toolbox.vfs.read(self.progress_path).entry
        if entry is None:
            return None
        return "Progress so far (from " + self.progress_path + "):\n" + entry

    def _crash_due(self) -> bool:
        """A14.3 (A15.6): the main run, once, after turn n. Not when the run ends on turn n."""
        return (
            self.agent == "main"
            and self.crash_turn is not None
            and not self.crashed
            and self.turn == self.crash_turn
        )

    def _crash(self) -> None:
        """A14.3: the process dies. With durable_session the log carries on from the next turn;
        without it the run starts over with the task, the script back at its start, and the
        workspace as it was left (A15.7: the tool's own state is kept)."""
        self.crashed = True
        self._emit("crash")
        if self.has_durable:
            self._emit("resume", from_turn=self.turn + 1)
            return
        self.messages = [user_message([text_block(self.tape.task)])]
        self.feedback_pending = False
        self.model = self._new_model()

    # ---- run_agent: sub-agents run inline (A14.1, A15.1 to A15.4) ----------------------------

    def _run_agent(self, tool_input: dict[str, Any]) -> tuple[bool, str, int]:
        """A14.1: an unknown agent, or the limit, is refused; otherwise the sub-agent runs now and
        its time is part of this call. The call's own latency is charged first."""
        name = text_field(tool_input, "agent")
        brief = text_field(tool_input, "brief")
        self.t += RUN_AGENT_LATENCY_MS
        if name not in self.tape.agents:
            return False, f"Unknown agent: {name}", 0
        if self.started >= self.subagent_max:
            return False, f"Sub-agent limit reached ({self.subagent_max})", 0
        self.started += 1
        k = self.started
        messages = self._sub_messages(self.subagent_context, brief)
        self._emit("subagent_start", name=name, k=k, context=self.subagent_context, brief=brief)
        tokens_in, tokens_out, cost = self.tokens_in, self.tokens_out, self.cost
        status, text, turns = self._run_sub(name, k, messages)
        self._emit(
            "subagent_end",
            name=name,
            k=k,
            status=status,
            turns=turns,
            tokens={"input": self.tokens_in - tokens_in, "output": self.tokens_out - tokens_out},
            cost=self.cost - cost,
            output=text,
        )
        if status == "done":
            return True, text, 0
        return False, f"Sub-agent ended {status}: {text}", 0

    def _sub_messages(self, context: str, brief: str) -> list[dict[str, Any]]:
        """A15.3: isolated, [user(brief)]. Forked: the parent's sent messages up to the last user
        message before the reply that holds the call, with text(brief) appended to that message."""
        if context == "isolated":
            return [user_message([text_block(brief)])]
        history = self.messages[:-1]  # the reply holding the call is the last message
        if not self.resend:
            history = history[:1]
        last_user = max(i for i, message in enumerate(history) if message["role"] == "user")
        forked = [dict(message) for message in history[: last_user + 1]]
        content = list(history[last_user]["content"])
        forked[-1] = {"role": "user", "content": [*content, text_block(brief)]}
        return forked

    def _run_sub(self, name: str, k: int, messages: list[dict[str, Any]]) -> tuple[str, str, int]:
        """The sub-agent's loop (A14.1), with the parent's state put back afterwards."""
        saved = self._save_state()
        try:
            self._enter_sub(name, k, messages)
            status = self._loop()
            return status, self.last_text, self.turn
        finally:
            self._restore_state(saved)

    def _enter_sub(self, name: str, k: int, messages: list[dict[str, Any]]) -> None:
        """Swap in the sub-agent's own messages, script, system prompt and turn count. The modules
        that apply inside it are those of A15.1; the rest are the parent's alone."""
        spec = self.tape.agents[name]
        self.agent = f"{name}#{k}"
        self.scope = f"a{k}_"
        self.system_base = str(spec.get("system", self.tape.system))
        self.messages = messages
        self.turn = 0
        self.turn_base = 0
        self.model = ScriptedModel(
            self.tape, self.rng, list(spec["script"]), f"/agents/{name}/script", self.choices
        )
        self.consecutive_failures = 0
        self.feedback_count = 0
        self.feedback_pending = False
        self.last_permission = None
        self.last_truncated = False
        self.recent_calls = []
        self.compacted = False
        self.progress_layer = None
        self.last_text = ""
        self.has_turn_limit = True  # A15.1: its own max_turns replaces turn_limit
        self.max_turns = self.subagent_max_turns
        self.has_verify = False
        self.has_loop = False
        self.has_budget = False
        self.has_search = False
        self.has_subagents = False  # no nesting
        self.has_compaction = False
        self.has_cache = False
        self.has_clock = False
        self.has_rules_file = False
        self.has_split = False
        self.first_block_only = False
        self.resend = True
        self.has_close_books = False

    def _save_state(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in SWAPPED}

    def _restore_state(self, saved: dict[str, Any]) -> None:
        for name, value in saved.items():
            setattr(self, name, value)

    # ---- events ------------------------------------------------------------------------------

    def _emit(self, kind: str, **fields: Any) -> None:
        self.rec.emit(kind, self.t, self.turn, fields, self.agent)

    def _trace_write(self) -> None:
        self.rec.trace_write(self.t, self.turn, self.agent)
