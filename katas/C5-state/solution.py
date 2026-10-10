ALLOWED = ("done", "max_turns", "interrupted", "error")
INTERRUPTED = "Interrupted by the user before this ran."


def new_state(task):
    return {"messages": [{"role": "user", "content": task}], "turn": 0, "status": None}


def end(state, status):
    if status not in ALLOWED:
        raise ValueError(f"unknown status: {status}")
    if state["status"] is not None:
        raise RuntimeError(f"the run already ended: {state['status']}")
    state["status"] = status
    return state


def close_books(state, pending_ids):
    if not pending_ids:
        return state
    results = [
        {"type": "tool_result", "tool_use_id": tid, "content": INTERRUPTED, "is_error": True}
        for tid in pending_ids
    ]
    state["messages"].append({"role": "user", "content": results})
    return state
