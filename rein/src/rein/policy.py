"""Permissions and the simulated approver (ENGINE.md sections 5, 7.1, 7.5; amendments A2, A3).

A3.9: a matched rule is named ``rules[<i>]`` (its 0-based index in the board's list); no match is
rule ``default`` with reason ``no rule matched (mode <mode>)``. A3.10: globs match the whole
string, with ``**`` and ``?`` matching any character and ``*`` any character but "/"; a
non-string input value is matched by its pyjson form; an absent field never matches.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from .prng import Mulberry32
from .vfs import pyjson_text

NO_POLICY = ("allow", "none", "no permission policy")


@lru_cache(maxsize=256)
def glob_regex(glob: str) -> re.Pattern[str]:
    out: list[str] = []
    index = 0
    while index < len(glob):
        if glob.startswith("**", index):
            out.append("[\\s\\S]*")
            index += 2
            continue
        char = glob[index]
        if char == "*":
            out.append("[^/]*")
        elif char == "?":
            out.append("[\\s\\S]")
        else:
            out.append(re.escape(char))
        index += 1
    return re.compile("".join(out))


def glob_matches(glob: str, value: str) -> bool:
    return glob_regex(glob).fullmatch(value) is not None


def fields_match(globs: dict[str, str], tool_input: dict[str, Any]) -> bool:
    """Every field's glob matches the input's value (its pyjson form when not a string).
    An absent field never matches, and an empty set of globs matches everything."""
    for name, glob in globs.items():
        if name not in tool_input:
            return False
        if not glob_matches(glob, pyjson_text(tool_input[name])):
            return False
    return True


@dataclass(frozen=True)
class Rule:
    index: int
    decision: str
    tool: str
    match: dict[str, str]
    reason: str

    @property
    def label(self) -> str:
        return f"rules[{self.index}]"

    def applies(self, name: str, tool_input: dict[str, Any]) -> bool:
        if self.tool not in ("*", name):
            return False
        return fields_match(self.match, tool_input)


@dataclass
class Policy:
    mode: str
    rules: list[Rule] = field(default_factory=list)

    @classmethod
    def from_params(cls, params: dict[str, Any]) -> Policy:
        rules = [
            Rule(
                index=index,
                decision=str(raw["decision"]),
                tool=str(raw["tool"]),
                match={str(k): str(v) for k, v in dict(raw.get("match", {})).items()},
                reason=str(raw["reason"]),
            )
            for index, raw in enumerate(params.get("rules", []))
        ]
        return cls(mode=str(params["mode"]), rules=rules)

    def decide(self, name: str, tool_input: dict[str, Any]) -> tuple[str, str, str]:
        """(decision, rule, reason). Deny rules first, then ask, then allow; first match wins."""
        for decision in ("deny", "ask", "allow"):
            for rule in self.rules:
                if rule.decision == decision and rule.applies(name, tool_input):
                    return decision, rule.label, rule.reason
        return self.mode, "default", f"no rule matched (mode {self.mode})"


@dataclass
class Approver:
    """The simulated human for `ask` decisions (A2). Draws only once fatigue has set in."""

    default: str
    deny_if: dict[str, str]
    fatigue_after: int | None
    approve_percent: int
    asks: int = 0

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> Approver:
        fatigue = config.get("fatigue")
        return cls(
            default=str(config["default"]),
            deny_if={str(k): str(v) for k, v in dict(config.get("deny_if", {})).items()},
            fatigue_after=int(fatigue["after"]) if fatigue is not None else None,
            approve_percent=int(fatigue["approve_percent"]) if fatigue is not None else 0,
        )

    def answer(self, tool_input: dict[str, Any], rng: Mulberry32) -> str:
        self.asks += 1
        fatigued = self.fatigue_after is not None and self.asks > self.fatigue_after
        if fatigued and rng.percent() < self.approve_percent:
            return "approve"
        if self.deny_if and fields_match(self.deny_if, tool_input):
            return "deny"
        return self.default
