import math


def pass_k(rows, k):
    """Estimate pass@k and pass^k from trial results, averaged over the tasks.

    rows is a list with one entry per task: a list of booleans, one per trial (True means the trial
    passed). The trials of a task may be more or fewer than another task's. k is the number of
    tries, with 1 <= k <= the trials of each task.

    For a task with n trials and c passes: pass@k is the chance that at least one of k tries passes,
    which is 1 - C(n - c, k) / C(n, k). pass^k is the chance that all k tries pass, which is
    C(c, k) / C(n, k). C(a, b) is math.comb(a, b).

    Return (pass_at_k, pass_hat_k): the two averages over the tasks, as floats.
    """
    at_total = 0.0
    hat_total = 0.0
    for trials in rows:
        n = len(trials)
        c = sum(1 for passed in trials if passed)
        total = math.comb(n, k)
        at_total += 1 - math.comb(n - c, k) / total
        hat_total += math.comb(c, k) / total
    return at_total / len(rows), hat_total / len(rows)
