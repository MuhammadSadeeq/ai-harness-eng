def run_turns(step, max_turns):
    """Call step() at most max_turns times. Return "done" as soon as it says so."""
    for _ in range(max_turns):
        if step() == "done":
            return "done"
    return "max_turns"
