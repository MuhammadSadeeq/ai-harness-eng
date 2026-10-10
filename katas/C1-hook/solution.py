def check_call(call, rules):
    """Return {"decision": "allow" or "deny", "reason": str} for one tool call.

    call is {"tool": name, "input": dict}. rules is a list of
    {"decision": "deny", "tool": name, "prefix": str, "reason": str}.
    A deny rule matches when the tool is the same and input["path"] starts with the prefix.
    The hook fails closed: if it cannot check the call, it denies.
    """
    try:
        tool = call["tool"]
        data = call["input"]
        if not isinstance(tool, str) or not isinstance(data, dict):
            return {"decision": "deny", "reason": "malformed call: fails closed"}
        for rule in rules:
            if rule["decision"] != "deny" or rule["tool"] != tool:
                continue
            path = data.get("path")
            if not isinstance(path, str):
                return {"decision": "deny", "reason": "no path to check: fails closed"}
            if path.startswith(rule["prefix"]):
                return {"decision": "deny", "reason": rule["reason"]}
        return {"decision": "allow", "reason": ""}
    except Exception:
        return {"decision": "deny", "reason": "the check failed: fails closed"}
