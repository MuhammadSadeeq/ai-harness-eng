"""The lethal trifecta: which of its three legs a tool set opens.

A tool is a dict with a "name" and a "trifecta" list. The three legs are private_data (the tool reads what it should not
share), untrusted_content (it reads what outsiders wrote) and exfiltration (it sends data out). A control can cut a leg:
a cut leg is listed in `cut` and is not open.
"""

LEGS = ("private_data", "untrusted_content", "exfiltration")


def legs_open(tools: list[dict], cut: tuple[str, ...] = ()) -> list[str]:
    """Return the open legs in LEGS order, without the cut ones. Raise ValueError for an unknown leg name."""
    return []


def lethal(tools: list[dict], cut: tuple[str, ...] = ()) -> bool:
    """True when all three legs are open."""
    return False
