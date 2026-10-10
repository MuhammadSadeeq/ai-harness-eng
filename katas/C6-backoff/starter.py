TRANSIENT = ("overloaded", "rate_limit", "api_error", "timeout")


def should_retry(error_type, attempt, max_attempts):
    """Retry a transient error while attempts remain. Never retry a permanent error.

    attempt is the attempt that just failed (1-based). A transient error retries while
    attempt < max_attempts. Anything else, such as "invalid_request", is permanent: False.
    """
    raise NotImplementedError("transient errors retry until the last attempt; permanent ones never do")


def backoff_ms(attempt, base_ms, cap_ms, jitter, draw=0):
    """How long to wait after attempt (1-based) failed. ENGINE section 7.3.

    base = min(cap_ms, base_ms * 2 ** (attempt - 1))
    jitter "none": the wait is base.
    jitter "full": the wait is draw % (base + 1), a value from 0 to base. draw is supplied by the caller.
    Any other jitter raises ValueError.
    """
    raise NotImplementedError("double the wait each attempt, cap it, then add full jitter if asked")


def breaker_open(failures_in_a_row, threshold):
    """The circuit breaker is open once the failures in a row reach the threshold."""
    raise NotImplementedError("open at the threshold, not after it")
