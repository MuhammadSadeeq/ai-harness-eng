"""Boards: which modules are plugged, and with what parameters (ENGINE.md section 7)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .plain import check_plain, loads_strict
from .spec import MODULES


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
