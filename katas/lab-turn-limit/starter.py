def run_turns(step, max_turns):
    """Call step() until it says
    "done", then return "done".

    Add a second exit: after
    max_turns calls, stop with
    "max_turns" instead.
    """
    while True:
        if step() == "done":
            return "done"
