import re

BLOCKED = [r"\brm\s", r"\bsudo\b", r"\bgit\s+push\b", r"\bcurl\b", r"\bwget\b"]
ALLOWED = [r"^python\s+test_\w+\.py\b", r"^python\s+-m\s+pytest\b"]
CHAINING = re.compile(r"[;&|`$<>]")


def decide(tool_name, read_only, args, mode):
    """Return "allow", "ask" or "deny" for one tool call. Deny rules are checked before allow rules."""
    raise NotImplementedError("follow the order in the policy: read-only, deny list, allow list with the chaining check, then the edit mode")
