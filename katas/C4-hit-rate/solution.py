def _parts(usage):
    input_tokens = usage.get("input_tokens", 0)
    written = usage.get("cache_creation_input_tokens", 0)
    read = usage.get("cache_read_input_tokens", 0)
    return input_tokens, written, read, input_tokens + written + read


def hit_percent(usage):
    _, _, read, total = _parts(usage)
    if total == 0:
        return 0
    return 100 * read // total


def saving_percent(usage):
    input_tokens, written, read, total = _parts(usage)
    if total == 0:
        return 0
    no_cache = total * 1000
    with_cache = input_tokens * 1000 + written * 1250 + read * 50
    return 100 * (no_cache - with_cache) // no_cache
