TRANSIENT = ("overloaded", "rate_limit", "api_error", "timeout")


def should_retry(error_type, attempt, max_attempts):
    return error_type in TRANSIENT and attempt < max_attempts


def backoff_ms(attempt, base_ms, cap_ms, jitter, draw=0):
    base = min(cap_ms, base_ms * 2 ** (attempt - 1))
    if jitter == "none":
        return base
    if jitter == "full":
        return draw % (base + 1)
    raise ValueError(f"unknown jitter: {jitter}")


def breaker_open(failures_in_a_row, threshold):
    return failures_in_a_row >= threshold
