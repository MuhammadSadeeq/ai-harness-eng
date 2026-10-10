def read_reply(reply):
    """Read every content block of a reply, and say what the harness does next.

    reply is {"stop_reason": ..., "content": [...]}. Its content is a list of blocks. A block with
    "type": "text" has "text". A block with "type": "tool_use" has "id", "name" and "input".

    Return (text, calls, action):
      text: the text of every text block, in order, joined with "\\n". Not only the first block.
      calls: (id, name, input) for every tool_use block, in order.
      action: "run_tools" when stop_reason is "tool_use" and there is at least one call;
              "done" when stop_reason is "end_turn";
              "stop" for anything else (max_tokens, refusal, pause_turn, stop_sequence, or a
              tool_use with no call). Nothing is run for "stop".
    """
    blocks = reply["content"]
    text = "\n".join(block["text"] for block in blocks if block["type"] == "text")
    calls = [(block["id"], block["name"], block["input"]) for block in blocks if block["type"] == "tool_use"]
    stop = reply["stop_reason"]
    if stop == "tool_use" and calls:
        action = "run_tools"
    elif stop == "end_turn":
        action = "done"
    else:
        action = "stop"
    return text, calls, action
