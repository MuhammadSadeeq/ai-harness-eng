def run_eval(trials):
    """Count one eval's runs and tasks. trials is a list of {"task", "trial", "status", "passed"}.

    The code grader passes a run only when it is a true done: status "done" and passed True. A run that a guard
    stopped while its files were right does not pass.
    """
    runs = len(trials)
    passes = sum(1 for t in trials if t["status"] == "done" and t["passed"] is True)
    by_task = {}
    for t in trials:
        by_task.setdefault(t["task"], []).append(t["status"] == "done" and t["passed"] is True)
    any_pass = sum(1 for oks in by_task.values() if any(oks))
    all_pass = sum(1 for oks in by_task.values() if all(oks))
    return {"runs": runs, "passes": passes, "tasks_any_pass": any_pass, "tasks_all_pass": all_pass}
