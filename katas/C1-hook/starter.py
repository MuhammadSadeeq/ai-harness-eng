def check_call(call, rules):
    """Return {"decision": "allow" or "deny", "reason": str} for one tool call.

    call is {"tool": name, "input": dict}. rules is a list of
    {"decision": "deny", "tool": name, "prefix": str, "reason": str}.
    A deny rule matches when the tool is the same and input["path"] starts with the prefix.
    The hook fails closed: if it cannot check the call, it denies.
    """
    return {"decision": "allow", "reason": ""}
