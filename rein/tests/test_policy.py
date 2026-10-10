"""Globs, the decision order, and the simulated approver (ENGINE.md section 7.5; amendment A2)."""

from __future__ import annotations

import pytest

from rein.policy import Approver, Policy, fields_match, glob_matches
from rein.prng import Mulberry32


@pytest.mark.parametrize(
    ("glob", "value", "expected"),
    [
        ("calc.py", "calc.py", True),
        ("calc.py", "calc.pyc", False),
        ("*.py", "calc.py", True),
        ("*.py", "pkg/calc.py", False),  # * does not cross "/"
        ("**.py", "pkg/calc.py", True),  # ** does
        ("src/?.py", "src/a.py", True),
        ("src/?.py", "src/ab.py", False),
        ("a.b", "axb", False),  # "." is literal
        ("pytest*", "pytest -q", True),
        ("**", "line\nbreak", True),  # any character, newline included
        ("?", "\n", True),
    ],
)
def test_glob_translation(glob: str, value: str, expected: bool) -> None:
    assert glob_matches(glob, value) is expected


def test_deny_rules_win_over_ask_and_allow() -> None:
    policy = Policy.from_params(
        {
            "mode": "allow",
            "rules": [
                {"decision": "allow", "tool": "*", "reason": "all allowed"},
                {"decision": "ask", "tool": "edit_file", "reason": "ask first"},
                {
                    "decision": "deny",
                    "tool": "edit_file",
                    "match": {"path": "*.lock"},
                    "reason": "no",
                },
            ],
        }
    )
    assert policy.decide("edit_file", {"path": "a.lock"}) == ("deny", "rules[2]", "no")
    assert policy.decide("edit_file", {"path": "a.py"}) == ("ask", "rules[1]", "ask first")
    assert policy.decide("read_file", {"path": "a.py"}) == ("allow", "rules[0]", "all allowed")


def test_mode_is_the_default_and_missing_fields_do_not_match() -> None:
    policy = Policy.from_params(
        {
            "mode": "deny",
            "rules": [
                {
                    "decision": "allow",
                    "tool": "read_file",
                    "match": {"path": "*.py"},
                    "reason": "py",
                }
            ],
        }
    )
    assert policy.decide("read_file", {"path": "a.txt"}) == (
        "deny",
        "default",
        "no rule matched (mode deny)",
    )
    assert policy.decide("read_file", {}) == ("deny", "default", "no rule matched (mode deny)")


def test_approver_without_fatigue_uses_the_default_and_no_draws() -> None:
    rng = Mulberry32(1)
    before = rng.next()
    rng = Mulberry32(1)
    approver = Approver.from_config({"default": "approve"})
    assert approver.answer({}, rng) == "approve"
    assert rng.next() == before  # nothing was drawn


def test_careful_human_denies_when_every_deny_if_glob_matches() -> None:
    approver = Approver.from_config(
        {"default": "approve", "deny_if": {"cmd": "rm *", "path": "/*"}}
    )
    rng = Mulberry32(1)
    assert approver.answer({"cmd": "rm -rf x", "path": "/etc"}, rng) == "deny"
    assert approver.answer({"cmd": "rm -rf x", "path": "src"}, rng) == "approve"
    assert approver.answer({"cmd": "ls"}, rng) == "approve"


def test_fatigue_draws_only_after_the_threshold() -> None:
    approver = Approver.from_config(
        {"default": "deny", "deny_if": {"cmd": "*"}, "fatigue": {"after": 2, "approve_percent": 50}}
    )
    rng = Mulberry32(20261010)
    # asks 1 and 2: careful, no draw
    assert approver.answer({"cmd": "x"}, rng) == "deny"
    assert approver.answer({"cmd": "x"}, rng) == "deny"
    # ask 3: one draw; below 50 approves without looking, otherwise careful (deny here)
    draw = Mulberry32(20261010)  # the first draw of the stream: the careful asks drew nothing
    expected = "approve" if draw.percent() < 50 else "deny"
    assert approver.answer({"cmd": "x"}, rng) == expected
    assert approver.asks == 3


# A3.9 and A3.10: rule naming, the default reason, and globs over non-string values.
def test_default_reason_names_the_mode() -> None:
    policy = Policy.from_params({"mode": "ask", "rules": []})
    assert policy.decide("read_file", {}) == ("ask", "default", "no rule matched (mode ask)")


def test_rules_are_named_by_their_list_index() -> None:
    policy = Policy.from_params(
        {
            "mode": "allow",
            "rules": [
                {"decision": "allow", "tool": "a", "reason": "x"},
                {"decision": "allow", "tool": "b", "reason": "y"},
                {"decision": "deny", "tool": "c", "reason": "z"},
            ],
        }
    )
    assert policy.decide("c", {})[1] == "rules[2]"
    assert policy.decide("b", {})[1] == "rules[1]"


def test_non_string_input_is_matched_by_its_pyjson_form() -> None:
    assert glob_matches("5", "5")
    assert fields_match({"n": "5"}, {"n": 5})  # 5 matches "5" by pyjson
    assert fields_match({"ok": "true"}, {"ok": True})  # True is "true"
    assert fields_match({"v": "[1, 2]"}, {"v": [1, 2]})
    assert not fields_match({"n": "6"}, {"n": 5})


def test_an_absent_field_never_matches_even_for_star() -> None:
    assert fields_match({"path": "*"}, {}) is False
    assert fields_match({"path": "**"}, {"other": 1}) is False
