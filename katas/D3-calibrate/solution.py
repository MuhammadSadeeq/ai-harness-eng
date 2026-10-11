def calibrate(pairs):
    """Compare a model grader with human labels. pairs is a list of (model_pass, human_pass), both bools.

    Returns {"of", "agree", "agreement", "false_passes", "false_fails"}. agreement is the fraction of cases where the
    grader and the human agree. A false pass is a case the model passed and the human failed; a false fail is the reverse.
    With no cases the agreement is 0.0.
    """
    of = len(pairs)
    agree = sum(1 for m, h in pairs if m == h)
    false_passes = sum(1 for m, h in pairs if m and not h)
    false_fails = sum(1 for m, h in pairs if not m and h)
    agreement = agree / of if of else 0.0
    return {"of": of, "agree": agree, "agreement": agreement, "false_passes": false_passes, "false_fails": false_fails}
