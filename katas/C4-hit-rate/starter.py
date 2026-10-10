def hit_percent(usage):
    """How much of this call's input came from the cache, as a whole percent, rounded down.

    usage is the response's usage object as a dict. Its input fields:
      input_tokens: input after the last cache breakpoint (not cached, not written);
      cache_creation_input_tokens: input written to the cache by this call;
      cache_read_input_tokens: input read from the cache by this call.
    A missing field reads as 0. Every input token is counted once:
    total = input_tokens + cache_creation_input_tokens + cache_read_input_tokens.
    Return 0 when total is 0. Otherwise return floor(100 * read / total).
    """
    raise NotImplementedError("count the read tokens over every input token, rounded down")


def saving_percent(usage):
    """How much cheaper this call's input was than the same input with no cache, as a whole percent.

    The same three fields as hit_percent. Prices are in units of the base input price, times 1000:
      no cache:  total * 1000
      with cache: input_tokens * 1000 + cache_creation_input_tokens * 1250 + cache_read_input_tokens * 50
    (Sonnet 5.5: a cache write costs 1.25x the base input price, a cache read 0.05x.)
    Return 0 when total is 0. Otherwise return floor(100 * (no_cache - with_cache) / no_cache).
    A first call that only writes the cache comes out negative: it costs more than no cache.
    """
    raise NotImplementedError("price the call with and without the cache, and compare")
