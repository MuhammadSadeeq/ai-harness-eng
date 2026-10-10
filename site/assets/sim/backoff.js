// Backoff (docs/ENGINE.md, section 7.3). The harness and the labs (hx-outage) share this one rule.

/**
 * backoffWait(attempt, retry, prng, retryAfterMs) -> wait_ms
 *   attempt:      the attempt that failed (1-based).
 *   retry:        the board's retry module params {max_attempts, base_ms, cap_ms, jitter}.
 *   prng:         the run's PRNG (createPrng); drawn once, only for jitter "full".
 *   retryAfterMs: the error's retry_after_ms (0 when none).
 * base = min(cap_ms, base_ms * 2^(attempt-1)); jitter "full": wait = below(base + 1) (the PRNG
 * draw); jitter "none": wait = base; then wait = max(wait, retryAfterMs).
 */
export function backoffWait(attempt, retry, prng, retryAfterMs) {
  const base = Math.min(retry.cap_ms, retry.base_ms * 2 ** (attempt - 1));
  const wait = retry.jitter === "full" ? prng.below(base + 1) : base;
  return Math.max(wait, retryAfterMs);
}
