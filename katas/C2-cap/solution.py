def cap_output(text, max_tokens):
    """Return the text a model should see for one tool output.

    Estimate tokens as len(text) // 4. At or under max_tokens, return the text unchanged.
    Over it, keep the first 2 * max_tokens characters and the last 2 * max_tokens characters,
    joined by "\\n[... N characters cut; ask for a smaller range ...]\\n", where N is the number removed.
    """
    if len(text) // 4 <= max_tokens:
        return text
    keep = 2 * max_tokens
    removed = len(text) - 2 * keep
    tail = text[len(text) - keep:] if keep > 0 else ""
    return text[:keep] + "\n[... " + str(removed) + " characters cut; ask for a smaller range ...]\n" + tail
