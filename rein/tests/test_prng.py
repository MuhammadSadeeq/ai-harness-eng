"""mulberry32 against the shared fixture: 1,000 outputs for each of three seeds (section 3)."""

from __future__ import annotations

import json

import pytest
from support import SCENARIOS

from rein.prng import Mulberry32

FIXTURE = json.loads((SCENARIOS / "fixtures" / "prng.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("seed", [0, 1, 20261010])
def test_first_1000_outputs_match_fixture(seed: int) -> None:
    expected = FIXTURE["seeds"][f"seed_{seed}"]
    assert len(expected) == 1000
    rng = Mulberry32(seed)
    assert [rng.next() for _ in range(1000)] == expected


def test_percent_and_below_ranges() -> None:
    rng = Mulberry32(7)
    values = [rng.percent() for _ in range(2000)]
    assert min(values) >= 0 and max(values) <= 99
    assert {rng.below(3) for _ in range(300)} == {0, 1, 2}


def test_below_needs_a_positive_bound() -> None:
    with pytest.raises(ValueError):
        Mulberry32(1).below(0)


def test_same_seed_same_stream() -> None:
    a, b = Mulberry32(42), Mulberry32(42)
    assert [a.next() for _ in range(50)] == [b.next() for _ in range(50)]
