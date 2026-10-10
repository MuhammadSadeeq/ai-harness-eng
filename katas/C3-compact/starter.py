def compact(notes, keep, current_turn):
    """Return the summary text for the notes that are kept.

    notes is a list of {"id", "kind", "turn", "text"}. Keep a note when its kind is in keep and its
    turn is before current_turn. The summary starts with "Summary of the work so far:" and has one
    "\\n- kind: text" line per kept note, or "\\n- (nothing kept)" when none is kept.
    """
    return ""


def new_history(messages, notes, keep, current_turn):
    """Return the new history: the summary as one user message, then the last two messages.

    Compact only when there are at least five messages and the last one is a user message;
    otherwise return the messages unchanged.
    """
    return messages
