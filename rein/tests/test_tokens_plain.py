"""tokens (section 4) and the strict loader (section 1 rules 1 to 3)."""

from __future__ import annotations

import pytest

from rein.plain import PlainError, check_plain, loads_strict
from rein.tokens import tokens


def test_tokens_is_floor_of_pyjson_length_over_four() -> None:
    assert tokens("abcd") == 1  # '"abcd"' is 6 characters: 6 // 4
    assert tokens([]) == 0  # "[]" is 2 characters
    assert tokens({"a": 1}) == 2  # '{"a": 1}' is 8 characters


def test_loader_accepts_integers_and_ascii() -> None:
    assert loads_strict('{"a": [1, -2, true, null], "b": "x\\ny"}') == {
        "a": [1, -2, True, None],
        "b": "x\ny",
    }


@pytest.mark.parametrize("text", ['{"a": 1.0}', '{"a": 1e3}', '{"a": NaN}', '{"a": Infinity}'])
def test_loader_rejects_floats_and_constants(text: str) -> None:
    with pytest.raises(PlainError):
        loads_strict(text)


def test_loader_rejects_non_ascii_text() -> None:
    with pytest.raises(PlainError, match="non-ASCII"):
        check_plain("café", "$")


def test_loader_rejects_numeric_string_keys() -> None:
    with pytest.raises(PlainError, match="numeric-string"):
        check_plain({"12": 1}, "$")
    check_plain({"012": 1, "a1": 2}, "$")  # not canonical integers: allowed
