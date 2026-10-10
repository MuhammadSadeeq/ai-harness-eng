def input_error(tool, allowed, bad):
    noun = "field" if len(bad) == 1 else "fields"
    names = ", ".join(f"'{field}'" for field in bad)
    return f"{tool} has no {noun} {names}. It takes: {', '.join(allowed)}. Send again with only those fields."


def no_match(query, path):
    return f"No match for '{query}' in {path}. Try a shorter query, or path '.' for the whole repository."


def truncated(shown, total):
    return f"Showing the first {shown:,} of {total:,} lines. Ask for a narrower range, or search for the text you need."
