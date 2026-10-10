def send_turn(history, user_text, ask):
    """Send one user message as a turn and return the model's reply.

    history is the messages array: a list of {"role": ..., "content": ...} dicts that the caller keeps.
    ask(messages) sends a request and returns the model's reply text. It sees only what you pass it.

    Append the user message to history. Send the whole history with the call, not only the new
    message: the model keeps nothing between calls. Append the reply to history as an assistant
    message, then return the reply.
    """
    raise NotImplementedError("send the turn")
