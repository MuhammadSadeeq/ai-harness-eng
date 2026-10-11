def handoff(state):
    """Write the progress note the next session can act on without guessing.

    state: {"done": [str], "next": str, "open": [str], "files": [str]}. The note has one line
    per part: 'Done: ...' for each finished item, 'Next: ...' for the single step to take, 'Open: ...'
    for each question, and 'Files: ...' for the paths to start from. Raises ValueError when the
    note has no finished item, no next step, or a next step that runs over more than one line.
    """
    raise NotImplementedError("one line per part; refuse a note with no done item or no next step")
