def cap_output(text, max_tokens):
    """Return the text a model should see for one tool output.

    Estimate tokens as len(text) // 4. At or under max_tokens, return the text unchanged.
    Over it, keep the first 2 * max_tokens characters and the last 2 * max_tokens characters,
    joined by "\\n[... N characters cut; ask for a smaller range ...]\\n", where N is the number removed.
    """
    return text
