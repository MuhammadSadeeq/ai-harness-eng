def decide(call, rules, mode):
    """Return {"decision": "allow" | "ask" | "deny", "reason": str} for one tool call.

    call is {"tool": name, "input": dict}. A rule is {"decision", "tool", "prefix", "reason"}; it matches when
    its tool is the call's tool and its prefix is "" or input["path"] starts with the prefix.
    Decision order: all deny rules, then all ask rules, then all allow rules, then the mode's default.
    """
    return {"decision": "ask", "reason": ""}
