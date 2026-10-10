def run_turns(step, max_turns):
    """Call step() until it returns "done", then return "done".

    Add a second exit: after max_turns calls without "done", return "max_turns".
    """
    while True:
        if step() == "done":
            return "done"
