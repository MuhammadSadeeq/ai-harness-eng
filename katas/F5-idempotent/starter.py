def keyed_call(send, action_id, max_attempts):
    """Run one logical action. Every attempt sends the same key, so a repeat is a repeat.

    send(key) returns (ok, output). A reply that timed out is retried, with the same key,
    while attempts remain. Any other reply ends the action. Returns (ok, output, attempts).
    """
    raise NotImplementedError("one key per action; retry only a timed-out reply; stop at max_attempts")
