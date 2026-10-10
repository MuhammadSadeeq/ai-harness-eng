"""mulberry32, one stream per trial (ENGINE.md section 3, D-029)."""

from __future__ import annotations

_MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _MASK


class Mulberry32:
    """State is one unsigned 32-bit integer seeded with the trial seed."""

    def __init__(self, seed: int) -> None:
        self._state = seed & _MASK

    def next(self) -> int:
        self._state = (self._state + 0x6D2B79F5) & _MASK
        t = self._state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _MASK
        return (t ^ (t >> 14)) & _MASK

    def percent(self) -> int:
        """An integer 0 to 99."""
        return self.next() % 100

    def below(self, n: int) -> int:
        """An integer 0 to n-1; n must be at least 1."""
        if n < 1:
            raise ValueError("below(n) needs n >= 1")
        return self.next() % n
