import re

BLOCKED = [r"\brm\s", r"\bsudo\b", r"\bgit\s+push\b", r"\bcurl\b", r"\bwget\b"]
ALLOWED = [r"^python\s+test_\w+\.py\b", r"^python\s+-m\s+pytest\b"]
CHAINING = re.compile(r"[;&|`$<>]")


def decide(tool_name, read_only, args, mode):
    """The policy. Deny rules are checked before allow rules."""
    if read_only:
        return "allow"
    if tool_name == "run_command":
        command = args.get("command", "").strip()
        if any(re.search(p, command) for p in BLOCKED):
            return "deny"
        if any(re.search(p, command) for p in ALLOWED) and not CHAINING.search(command):
            return "allow"
        return "ask"
    if mode == "auto":
        return "allow"
    return "ask"
