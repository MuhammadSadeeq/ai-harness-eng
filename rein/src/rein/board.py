"""Boards: which modules are plugged, and with what parameters (ENGINE.md section 7)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .plain import check_plain, loads_strict
from .spec import EFFORT_LEVELS, MODULES, NOTE_KINDS


class BoardError(ValueError):
    """A board the engine cannot run."""


@dataclass(frozen=True)
class Board:
    id: str
    label: str
    modules: dict[str, dict[str, Any]] = field(default_factory=dict)

    def has(self, name: str) -> bool:
        return name in self.modules

    def param(self, module: str, name: str) -> Any:
        return self.modules[module][name]


def load_board(path: Path) -> Board:
    try:
        raw: Any = loads_strict(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise BoardError(f"{path}: {exc}") from exc
    return board_from_dict(raw)


def board_from_dict(raw: Any) -> Board:
    if not isinstance(raw, dict):
        raise BoardError("board must be a JSON object")
    try:
        check_plain(raw, "$")
    except ValueError as exc:
        raise BoardError(str(exc)) from exc
    modules_raw = raw.get("modules")
    if not isinstance(modules_raw, dict):
        raise BoardError("board.modules must be an object")
    for name, params in modules_raw.items():
        if name not in MODULES:
            raise BoardError(f"unknown module {name!r}")
        if not isinstance(params, dict):
            raise BoardError(f"module {name!r} must be an object")
        _check_module(name, params)
        _check_a6_a7(name, params)
    return Board(
        id=str(raw.get("id", "")),
        label=str(raw.get("label", "")),
        modules={str(k): dict(v) for k, v in modules_raw.items()},
    )


_INT_PARAMS: dict[str, dict[str, int]] = {
    "turn_limit": {"max_turns": 1},
    "token_budget": {"max_tokens": 1},
    "loop_detect": {"window": 2},
    "output_cap": {"max_tokens": 1},
    "retry": {"max_attempts": 1, "base_ms": 0, "cap_ms": 0},
    "breaker": {"threshold": 1},
    "verify_gate": {"max_feedback": 0},
    "subagents": {"max": 1, "max_turns": 1},  # A14.1
    "tool_retry": {"max_attempts": 1},  # A14.4
}


def _check_module(name: str, params: dict[str, Any]) -> None:
    for key, minimum in _INT_PARAMS.get(name, {}).items():
        value = params.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise BoardError(f"{name}.{key} must be an integer of at least {minimum}")
    if name == "retry" and params.get("jitter") not in ("none", "full"):
        raise BoardError("retry.jitter must be none or full")
    if name == "permissions":
        if params.get("mode") not in ("allow", "ask", "deny"):
            raise BoardError("permissions.mode must be allow, ask or deny")
        for rule in params.get("rules", []):
            _check_rule(rule)
    if name == "rules_file":  # A19: the board's rules replace the tape's, when given
        extra = sorted(set(params) - {"rules"})
        if extra:
            raise BoardError(f"rules_file has unknown keys {extra} (A19)")
        if "rules" in params:
            rules = params["rules"]
            if not isinstance(rules, list) or any(not isinstance(r, str) or not r for r in rules):
                raise BoardError("rules_file.rules must be a list of non-empty strings (A19)")
    if name == "sandbox":
        egress = params.get("egress", [])
        if not isinstance(egress, list):
            raise BoardError("sandbox.egress must be a list of hosts")
        for host in egress:
            if not isinstance(host, str) or host != host.lower():
                raise BoardError(f"sandbox.egress entry {host!r} must be lowercase (A3.8)")
    if name == "redact":
        patterns = params.get("patterns")
        if not isinstance(patterns, list) or any(not isinstance(p, str) or not p for p in patterns):
            raise BoardError("redact.patterns must be a list of non-empty strings")
    if name == "history" and (set(params) != {"resend"} or not isinstance(params["resend"], bool)):
        raise BoardError('history must be {"resend": true} or {"resend": false} (A5)')
    if name in ("durable_session", "idempotency", "capability_check") and params:
        raise BoardError(f"{name} takes no parameters (A14)")
    if name == "subagents":  # A14.1
        if set(params) != {"context", "max", "max_turns"}:
            raise BoardError("subagents takes context, max and max_turns (A14.1)")
        if params["context"] not in ("isolated", "forked"):
            raise BoardError("subagents.context must be isolated or forked (A14.1)")
    if name == "progress_file":  # A14.2
        path = params.get("path")
        if set(params) != {"path"} or not isinstance(path, str) or not path:
            raise BoardError('progress_file takes exactly {"path": "<path>"} (A14.2)')
    if name == "model":  # A14.5: the id must be a profile of the tape (checked by the harness)
        model_id = params.get("id")
        if set(params) != {"id"} or not isinstance(model_id, str) or not model_id:
            raise BoardError('model takes exactly {"id": "<model id>"} (A14.5)')
    if name == "request_params":  # A14.5: strings or integers, by name
        for key, value in params.items():
            if not key or isinstance(value, bool) or not isinstance(value, str | int):
                raise BoardError(f"request_params.{key} must be a string or an integer (A14.5)")


def _check_rule(rule: Any) -> None:
    if not isinstance(rule, dict):
        raise BoardError("a permission rule must be an object")
    if rule.get("decision") not in ("allow", "ask", "deny"):
        raise BoardError("rule.decision must be allow, ask or deny")
    if not isinstance(rule.get("tool"), str) or not rule.get("tool"):
        raise BoardError("rule.tool must be a non-empty string")
    if not isinstance(rule.get("reason"), str) or not rule.get("reason"):
        raise BoardError("rule.reason must be a non-empty string (A3.9)")
    match = rule.get("match", {})
    if not isinstance(match, dict) or any(not isinstance(v, str) for v in match.values()):
        raise BoardError("rule.match must map input fields to glob strings")


def _check_a6_a7(name: str, params: dict[str, Any]) -> None:
    """A6, A7 and A9 modules: the parameters the engine reads."""
    if name == "tool_overrides":  # A9.1: per tool, a description and/or an input_schema
        for tool, override in params.items():
            if (
                not isinstance(override, dict)
                or not override
                or set(override) - {"description", "input_schema"}
            ):
                raise BoardError(f"tool_overrides.{tool} takes description and/or input_schema")
            if "description" in override and (
                not isinstance(override["description"], str) or not override["description"]
            ):
                raise BoardError(f"tool_overrides.{tool}.description must be a non-empty string")
            if "input_schema" in override and not isinstance(override["input_schema"], dict):
                raise BoardError(f"tool_overrides.{tool}.input_schema must be an object")
    if name == "tool_pins":  # A11.5: {"pins": {"<server>": "<version>"}}, nothing else
        pins = params.get("pins")
        if set(params) != {"pins"} or not isinstance(pins, dict):
            raise BoardError('tool_pins takes exactly {"pins": {"<server>": "<version>"}} (A11.5)')
        for server, version in pins.items():
            if not isinstance(server, str) or not isinstance(version, str) or not server:
                raise BoardError("tool_pins.pins maps server names to version strings (A11.5)")
    if name == "tool_search":  # A9.2
        always = params.get("always")
        if not isinstance(always, list) or len(set(always)) != len(always):
            raise BoardError("tool_search.always must be a list of distinct tool names")
        for tool in always:
            if not isinstance(tool, str) or not tool:
                raise BoardError("tool_search.always must hold tool names")
    if (
        name == "verify_gate"
        and "pristine_tests" in params
        and not isinstance(params["pristine_tests"], bool)
    ):
        raise BoardError("verify_gate.pristine_tests must be true or false (A9.3)")
    if name == "cost_attribution" and params:
        raise BoardError("cost_attribution takes no parameters")
    if name == "compaction":
        percent = params.get("threshold_percent")
        if isinstance(percent, bool) or not isinstance(percent, int) or not 1 <= percent <= 100:
            raise BoardError("compaction.threshold_percent must be an integer from 1 to 100")
        keep = params.get("keep")
        if not isinstance(keep, list) or len(set(keep)) != len(keep):
            raise BoardError("compaction.keep must be a list of distinct note kinds")
        for kind in keep:
            if kind not in NOTE_KINDS:
                raise BoardError(f"compaction.keep has an unknown kind {kind!r}")
    if name == "effort" and params.get("level") not in EFFORT_LEVELS:
        raise BoardError("effort.level must be one of " + ", ".join(EFFORT_LEVELS))
    if name in ("system_clock", "cache", "validate_inputs", "split_results") and params:
        raise BoardError(f"{name} takes no parameters")
