def apply_discount(price_cents: int, percent: int) -> int:
    """The price after a percent discount. The discount rounds down, in cents.

    A percent below 0 or above 100 raises ValueError.
    """
    raise NotImplementedError("check the percent, then subtract the discount")


def cart_total(items: list[tuple[str, int]], percent: int) -> int:
    """The total of (name, price) items in cents, after one discount on the whole cart."""
    raise NotImplementedError("add the prices, then apply_discount once")
