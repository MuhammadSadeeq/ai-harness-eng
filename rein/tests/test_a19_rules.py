"""ENGINE.md A19: a board's rules replace the tape's rules for the whole run."""

from __future__ import annotations

from typing import Any

import pytest
from support import make_tape, of_kind, run

from rein.board import BoardError, board_from_dict

TAPE_RULE = "Use the tape rule."
FIXED_RULE = "Call render_report() in report.py."


def _script() -> list[dict[str, Any]]:
    """Says which rule text the request carries: sent_lacks is true when the text is absent."""
    return [
        {
            "when": [
                {
                    "if": f"sent_lacks:{TAPE_RULE}",
                    "then": [{"say": "tape rule gone", "stop": "end_turn"}],
                },
                {"else": [{"say": "tape rule sent", "stop": "end_turn"}]},
            ]
        }
    ]


def _reply(modules: dict[str, Any] | None) -> str:
    result = run(make_tape(rules=[TAPE_RULE], script=_script()), modules)
    return of_kind(result, "model_reply")[0]["text"]


def _layers(modules: dict[str, Any] | None) -> list[str]:
    result = run(make_tape(rules=[TAPE_RULE], script=_script()), modules)
    return of_kind(result, "prompt_built")[0]["layers"]


def test_a19_an_absent_rules_list_keeps_the_tape_rules() -> None:
    assert _reply({"rules_file": {}}) == "tape rule sent"
    assert "rules" in _layers({"rules_file": {}})


def test_a19_a_list_replaces_the_tape_rules_for_the_run() -> None:
    modules = {"rules_file": {"rules": [FIXED_RULE]}}
    assert _reply(modules) == "tape rule gone"
    assert "rules" in _layers(modules)


def test_a19_sent_lacks_sees_the_board_rules() -> None:
    result = run(
        make_tape(
            rules=[TAPE_RULE],
            script=[
                {
                    "when": [
                        {
                            "if": "sent_lacks:render_report()",
                            "then": [{"say": "no fix", "stop": "end_turn"}],
                        },
                        {"else": [{"say": "fix sent", "stop": "end_turn"}]},
                    ]
                }
            ],
        ),
        {"rules_file": {"rules": [FIXED_RULE]}},
    )
    assert of_kind(result, "model_reply")[0]["text"] == "fix sent"


def test_a19_an_empty_list_means_no_rules_layer() -> None:
    modules = {"rules_file": {"rules": []}}
    assert _reply(modules) == "tape rule gone"
    assert "rules" not in _layers(modules)


def test_a19_without_a_rules_file_the_tape_rules_are_not_sent() -> None:
    assert _reply(None) == "tape rule gone"
    assert "rules" not in _layers(None)


@pytest.mark.parametrize(
    "params",
    [
        {"rules": "one rule"},
        {"rules": [""]},
        {"rules": ["ok", 3]},
        {"rules": [None]},
        {"rules": ["ok"], "extra": 1},
        {"extra": []},
    ],
)
def test_a19_bad_shapes_are_refused(params: dict[str, Any]) -> None:
    with pytest.raises(BoardError, match="rules_file"):
        board_from_dict({"id": "b", "label": "B", "modules": {"rules_file": params}})


def test_a19_a_well_formed_list_is_accepted() -> None:
    board_from_dict({"id": "b", "label": "B", "modules": {"rules_file": {"rules": ["one", "two"]}}})
    board_from_dict({"id": "b", "label": "B", "modules": {"rules_file": {"rules": []}}})
    board_from_dict({"id": "b", "label": "B", "modules": {"rules_file": {}}})
