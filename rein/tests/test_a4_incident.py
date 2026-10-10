"""A4: the incident block's shape, checked by the loader; A3.13: keys with one normal form."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from support import BASE_TAPE, make_tape

from rein.tape import TapeError, tape_from_dict

GOOD: dict[str, Any] = {
    "family": "false-done",
    "wire": "verify",
    "board": "b",
    "seed": 1,
    "first_bad_seq": 3,
    "why": "The model said done.",
    "hint": "Look at the verify event.",
    "fixes": [{"text": "Add a gate.", "why": "It checks."}, {"text": "Ask again.", "why": "No."}],
    "correct_fix": 0,
    "par_s": 60,
}


def with_incident(**changes: Any) -> dict[str, Any]:
    incident = copy.deepcopy(GOOD)
    for key, value in changes.items():
        if value is None:
            incident.pop(key, None)
        else:
            incident[key] = value
    raw = copy.deepcopy(BASE_TAPE)
    raw["incident"] = incident
    return raw


def test_a4_a_good_block_loads_and_is_kept() -> None:
    tape = tape_from_dict(with_incident(accept_seqs=[5], notes=[{"seq": 2, "text": "Close."}]))
    assert tape.incident is not None and tape.incident["family"] == "false-done"
    assert tape.incident["accept_seqs"] == [5]


def test_a4_the_block_is_optional() -> None:
    assert tape_from_dict(copy.deepcopy(BASE_TAPE)).incident is None


@pytest.mark.parametrize(
    "key",
    [
        "family",
        "wire",
        "board",
        "seed",
        "first_bad_seq",
        "why",
        "hint",
        "fixes",
        "correct_fix",
        "par_s",
    ],
)
def test_a4_a_required_key_is_required(key: str) -> None:
    with pytest.raises(TapeError, match=f"missing keys .*{key}"):
        tape_from_dict(with_incident(**{key: None}))


def test_a4_no_extra_keys() -> None:
    raw = with_incident()
    raw["incident"]["colour"] = "red"
    with pytest.raises(TapeError, match="unknown keys"):
        tape_from_dict(raw)


@pytest.mark.parametrize("count", [1, 5])
def test_a4_fixes_are_two_to_four(count: int) -> None:
    fixes = [{"text": f"fix {i}", "why": "x"} for i in range(count)]
    with pytest.raises(TapeError, match="2 to 4 fixes"):
        tape_from_dict(with_incident(fixes=fixes))


def test_a4_a_fix_has_exactly_text_and_why() -> None:
    with pytest.raises(TapeError, match="exactly text and why"):
        tape_from_dict(with_incident(fixes=[{"text": "a"}, {"text": "b", "why": "c"}]))


def test_a4_a_note_has_exactly_seq_and_text() -> None:
    with pytest.raises(TapeError, match="exactly seq and text"):
        tape_from_dict(with_incident(notes=[{"seq": 1}]))


def test_a4_seqs_and_seed_are_non_negative_integers() -> None:
    with pytest.raises(TapeError, match="seed"):
        tape_from_dict(with_incident(seed=-1))
    with pytest.raises(TapeError, match="first_bad_seq"):
        tape_from_dict(with_incident(first_bad_seq="3"))


def test_a4_strings_are_non_empty() -> None:
    with pytest.raises(TapeError, match="why"):
        tape_from_dict(with_incident(why=""))


def test_a4_the_block_must_be_an_object() -> None:
    raw = copy.deepcopy(BASE_TAPE)
    raw["incident"] = ["not", "an", "object"]
    with pytest.raises(TapeError, match="incident must be an object"):
        tape_from_dict(raw)


# A3.13 (new): two keys with the same normal form are rejected.
def test_a3_13_keys_with_the_same_normal_form_are_rejected() -> None:
    with pytest.raises(TapeError, match="same normal form"):
        make_tape(workspace={"a": "x", "./a": "y"})


def test_a3_13_two_outside_keys_can_collide_too() -> None:
    # A workspace key and an outside key never share a normal form (one is inside the root,
    # the other is not), so the rule bites within each table.
    with pytest.raises(TapeError, match="same normal form"):
        make_tape(outside={"../x": "y", "../a/../x": "z"})
