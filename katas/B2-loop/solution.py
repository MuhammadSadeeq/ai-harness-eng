def run_loop(model, tools, task, max_turns, max_tokens):
    """Run the agent loop and return why it stopped.

    model(messages) returns a reply: {"stop_reason": ..., "content": [...],
    "usage": {"input_tokens": n, "output_tokens": n}}. Send it the full history.
    tools maps a tool name to a function that takes the tool's input dict and returns a string.
    max_turns is the turn limit: the most model calls the run may make.
    max_tokens is the token budget for the whole run (input plus output), not the model's reply cap.

    Return "done" for end_turn, "max_turns", "budget", or the stop_reason for anything else.
    """
    messages = [{"role": "user", "content": task}]
    calls = 0
    used = 0
    while True:
        if calls >= max_turns:
            return "max_turns"
        if used >= max_tokens:
            return "budget"
        reply = model(messages)
        calls += 1
        usage = reply.get("usage", {})
        used += usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        messages.append({"role": "assistant", "content": reply["content"]})
        stop = reply["stop_reason"]
        if stop == "end_turn":
            return "done"
        if stop != "tool_use":
            return stop
        results = []
        for block in reply["content"]:
            if block["type"] != "tool_use":
                continue
            name = block["name"]
            if name not in tools:
                results.append({"type": "tool_result", "tool_use_id": block["id"],
                                "content": f"unknown tool: {name}", "is_error": True})
            else:
                results.append({"type": "tool_result", "tool_use_id": block["id"],
                                "content": tools[name](block["input"])})
        messages.append({"role": "user", "content": results})
