TIMED_OUT = "Timed out"


def keyed_call(send, action_id, max_attempts):
    """Run one logical action. Every attempt sends the same key, so a repeat is a repeat.

    send(key) returns (ok, output). A reply that timed out is retried, with the same key,
    while attempts remain. Any other reply ends the action. Returns (ok, output, attempts).
    """
    key = action_id
    attempts = 0
    while True:
        attempts += 1
        ok, output = send(key)
        if ok or not output.startswith(TIMED_OUT) or attempts >= max_attempts:
            return ok, output, attempts
