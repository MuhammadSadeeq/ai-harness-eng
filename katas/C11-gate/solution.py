def verify(current, pristine, run):
    """Return {"passed": bool, "reason": str} for one verification.

    current is the suite the workspace holds now: {name: source}. pristine is the original suite.
    run(suite) returns True when every test in the suite passes.
    The gate runs the original suite only when current matches it exactly; otherwise it fails and says
    the tests were changed. An exception from run is a failure.
    """
    if current != pristine:
        return {"passed": False, "reason": "the tests were changed: the original suite is the one that counts"}
    try:
        ok = bool(run(pristine))
    except Exception:
        return {"passed": False, "reason": "the tests could not run"}
    return {"passed": ok, "reason": "" if ok else "a test from the original suite fails"}
