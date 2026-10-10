def apply_discount(price_cents: int, percent: int) -> int:
    """The price after a percent discount. The discount rounds down, in cents."""
    if not 0 <= percent <= 100:
        raise ValueError(f"percent must be 0 to 100, got {percent}")
    return price_cents - price_cents * percent // 100


def cart_total(items: list[tuple[str, int]], percent: int) -> int:
    """The total of the items in cents, after one discount on the whole cart."""
    return apply_discount(sum(price for _, price in items), percent)
