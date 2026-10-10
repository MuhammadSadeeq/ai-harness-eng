"""Prices: a tape's pricing resolved to milli-units per million tokens (ENGINE.md sections 5, 8)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


class PricingError(ValueError):
    """The tape's pricing cannot be resolved."""


@dataclass(frozen=True)
class Prices:
    input_milli: int
    output_milli: int


def usd_to_milli(usd: Any) -> int:
    """A USD-per-MTok value p becomes round(p * 1000) milli-units. Halves round up, as in JS
    Math.round, so both twins agree on every value."""
    if isinstance(usd, bool) or not isinstance(usd, int | float):
        raise PricingError(f"price {usd!r} is not a number")
    return math.floor(usd * 1000 + 0.5)


def resolve_prices(pricing: dict[str, Any], facts: dict[str, Any] | None) -> Prices:
    if "fact" in pricing:
        fact_id = str(pricing["fact"])
        if facts is None:
            raise PricingError(f"pricing names fact {fact_id!r}: pass --facts site/data/facts.json")
        entry = facts.get(fact_id)
        if not isinstance(entry, dict) or not isinstance(entry.get("value"), dict):
            raise PricingError(f"fact {fact_id!r} has no value in the facts registry")
        value: dict[str, Any] = entry["value"]
        try:
            return Prices(
                input_milli=usd_to_milli(value["input_usd_per_mtok"]),
                output_milli=usd_to_milli(value["output_usd_per_mtok"]),
            )
        except KeyError as exc:
            raise PricingError(f"fact {fact_id!r} lacks {exc.args[0]!r}") from exc
    try:
        return Prices(
            input_milli=int(pricing["input_milli_per_mtok"]),
            output_milli=int(pricing["output_milli_per_mtok"]),
        )
    except KeyError as exc:
        raise PricingError(f"inline pricing lacks {exc.args[0]!r}") from exc
