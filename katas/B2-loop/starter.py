def run_loop(model, tools, task, max_turns, max_tokens):
    """Run the agent loop and return why it stopped.

    model(messages) returns a reply: {"stop_reason": ..., "content": [...],
    "usage": {"input_tokens": n, "output_tokens": n}}. Send it the full history.
    tools maps a tool name to a function that takes the tool's input dict and returns a string.
    max_turns is the turn limit: the most model calls the run may make.
    max_tokens is the token budget for the whole run (input plus output), not the model's reply cap.

    Return "done" for end_turn, "max_turns", "budget", or the stop_reason for anything else.
    """
    raise NotImplementedError("write the loop here")
