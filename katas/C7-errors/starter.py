def input_error(tool, allowed, bad):
    """The text a tool returns when a call sends fields the tool does not have.

    tool: the tool's name. allowed: the field names the tool takes, in its order. bad: the field names the call sent
    that the tool does not have, in the call's order.
    Return one line that names the tool, names each bad field in quotes ("has no field 'file'" for one field,
    "has no fields 'file', 'dir'" for two or more), lists the allowed fields in order after "It takes: ", and ends
    with "Send again with only those fields."
    Example: input_error("search_text", ["query", "path"], ["file"]) ->
    "search_text has no field 'file'. It takes: query, path. Send again with only those fields."
    """
    raise NotImplementedError("name the tool, the bad fields and the allowed fields, and say what to send next")


def no_match(query, path):
    """The text for a search that found nothing: what was searched, and what to try next.
    Example: no_match("from calc import", "tests") ->
    "No match for 'from calc import' in tests. Try a shorter query, or path '.' for the whole repository."
    """
    raise NotImplementedError("say what was searched and offer the next try")


def truncated(shown, total):
    """The text for output that was cut short. shown and total are line counts; write them with thousands commas.
    Example: truncated(50, 1240) ->
    "Showing the first 50 of 1,240 lines. Ask for a narrower range, or search for the text you need."
    """
    raise NotImplementedError("say how much is shown, and what to ask for next")
