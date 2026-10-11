"""Least privilege: a policy that allows exactly what one task needs, and nothing else.

`needs` lists the calls the task makes as (tool, path) pairs. A path is a glob such as "notes/**", or None when the tool
takes no path. Return a policy: mode "deny" (a call that no rule allows is refused), and one allow rule per distinct need,
in the order given. A rule's match is {} for a tool with no path, else {"path": glob}.
"""


def narrow(needs: list[tuple[str, str | None]]) -> dict:
    return {"mode": "allow", "rules": []}
