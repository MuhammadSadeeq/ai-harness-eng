def handoff(state):
    """Write the progress note the next session can act on without guessing.

    state: {"done": [str], "next": str, "open": [str], "files": [str]}. The note has one line
    per part: 'Done: ...' for each finished item, 'Next: ...' for the single step to take, 'Open: ...'
    for each question, and 'Files: ...' for the paths to start from. Raises ValueError when the
    note has no finished item, no next step, or a next step that runs over more than one line.
    """
    done = [item.strip() for item in state.get("done", []) if item.strip()]
    nxt = state.get("next", "").strip()
    if not done:
        raise ValueError("a handoff says what is done")
    if not nxt:
        raise ValueError("a handoff needs one next step")
    if "\n" in nxt:
        raise ValueError("the next step is one step, on one line")
    lines = [f"Done: {item}" for item in done]
    lines.append(f"Next: {nxt}")
    lines += [f"Open: {question.strip()}" for question in state.get("open", []) if question.strip()]
    files = [name.strip() for name in state.get("files", []) if name.strip()]
    if files:
        lines.append(f"Files: {', '.join(files)}")
    return "\n".join(lines) + "\n"
