def new_state(task):
    """The one state object a run keeps. It starts with the task as the first user message.

    Return {"messages": [{"role": "user", "content": task}], "turn": 0, "status": None}.
    """
    raise NotImplementedError("return the one state dict for a new run")


def end(state, status):
    """The one exit a run takes. Set the status once and return the state.

    status must be "done", "max_turns", "interrupted" or "error"; any other value raises ValueError.
    A second end raises RuntimeError("the run already ended: <status>"): one run has one final status.
    """
    raise NotImplementedError("set the final status once")


def close_books(state, pending_ids):
    """Answer every tool call that is still pending, so the history stays valid.

    pending_ids: the tool_use ids that got no result (in order). If there are none, change nothing.
    Otherwise append one user message whose content is one tool_result per id, in order:
      {"type": "tool_result", "tool_use_id": id, "content": "Interrupted by the user before this ran.", "is_error": True}
    History is append-only: no earlier message is changed or removed. Return the state.
    """
    raise NotImplementedError("append one error result for each pending call, in one message")
