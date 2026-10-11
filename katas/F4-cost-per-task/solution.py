def cost_per_completed(trials):
    """Cost per completed task for one board: all the cost, divided by the runs that completed.

    trials is a list of {"status", "passed", "cost"}; cost is in nano-units. A run completes only as a true done:
    status "done" and passed True. The cost of every run counts, completed or not. Floor the result to an integer.
    With no completed run there is no cost per completed task, so return None.
    """
    total = sum(t["cost"] for t in trials)
    completed = sum(1 for t in trials if t["status"] == "done" and t["passed"] is True)
    if completed == 0:
        return None
    return total // completed
