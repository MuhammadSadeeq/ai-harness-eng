import math

Z = 1.959964


def wilson(passed, n):
    """The 95% Wilson score interval for passed out of n, as (lo, hi) fractions. n is positive."""
    p = passed / n
    z2 = Z * Z
    denom = 1 + z2 / n
    centre = (p + z2 / (2 * n)) / denom
    half = Z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def differ(a, b):
    """True when two results really differ: their Wilson intervals do not overlap. a and b are (passed, n)."""
    lo_a, hi_a = wilson(*a)
    lo_b, hi_b = wilson(*b)
    return hi_a < lo_b or hi_b < lo_a
