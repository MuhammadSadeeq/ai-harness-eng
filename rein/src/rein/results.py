"""The results file and its table (BP-4.2 §3): ``rein eval --out`` writes it, and
``rein results --markdown`` prints the course's table from it. The columns are the ones I3's
portfolio projects use."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

COLUMNS = ("Task", "Passed of trials", "Wilson 95% interval", "Tokens", "Cost", "Scripted")
Z95 = 1.959963984540054
NANO_PER_USD = 1_000_000_000


class ResultsError(ValueError):
    """A results file the command cannot read or write."""


def wilson_interval(passed: int, n: int, z: float = Z95) -> tuple[float, float]:
    """The Wilson score interval for passed of n, as fractions in [0, 1]."""
    if n <= 0:
        return (0.0, 1.0)
    p = passed / n
    z2 = z * z
    denom = 1 + z2 / n
    centre = (p + z2 / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom
    low = 0.0 if passed == 0 else max(0.0, centre - half)
    high = 1.0 if passed == n else min(1.0, centre + half)
    return (low, high)


def build_results(
    *,
    eval_id: str,
    board: str,
    model: str,
    date: str,
    scripted: bool,
    priced: bool,
    trials: int,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """The results object: per task, the passes of its trials, the Wilson interval, the tokens and
    the cost (nano-units). ``priced`` says whether the cost is in USD (a board or model priced
    from the facts)."""
    tasks: list[dict[str, Any]] = []
    order: list[str] = []
    for row in rows:
        if row["task"] not in order:
            order.append(str(row["task"]))
    for task_id in order:
        mine = [row for row in rows if row["task"] == task_id]
        passed = sum(1 for row in mine if row["code"])
        low, high = wilson_interval(passed, len(mine))
        tasks.append(
            {
                "task": task_id,
                "passed": passed,
                "trials": len(mine),
                "interval": [round(low, 6), round(high, 6)],
                "tokens": {
                    "input": sum(int(row["tokens"]["input"]) for row in mine),
                    "output": sum(int(row["tokens"]["output"]) for row in mine),
                },
                "cost": sum(int(row["cost"]) for row in mine),
            }
        )
    return {
        "eval": eval_id,
        "board": board,
        "model": model,
        "date": date,
        "trials": trials,
        "scripted": scripted,
        "priced": priced,
        "tasks": tasks,
    }


def write_results(path: Path, results: dict[str, Any]) -> None:
    try:
        path.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError as exc:
        raise ResultsError(f"cannot write {path}: {exc.strerror}") from None


def read_results(path: Path) -> dict[str, Any]:
    try:
        data: Any = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ResultsError(f"cannot read {path}: {exc.strerror}") from None
    except json.JSONDecodeError as exc:
        raise ResultsError(f"{path} is not a results file: {exc.msg}") from None
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
        raise ResultsError(f"{path} is not a results file: no tasks list")
    return data


def _percent(fraction: float) -> str:
    return f"{fraction * 100:.1f}%"


def _cost(nano: int, priced: bool) -> str:
    if priced:
        return f"${nano / NANO_PER_USD:.4f}"
    return f"{nano / NANO_PER_USD:.4f} units"


def render_markdown(results: dict[str, Any]) -> str:
    """The course's results table, with a line saying whether the numbers are scripted."""
    scripted = bool(results["scripted"])
    priced = bool(results.get("priced", False))
    lines = [
        "| " + " | ".join(COLUMNS) + " |",
        "|" + "|".join("---" for _ in COLUMNS) + "|",
    ]
    for task in results["tasks"]:
        low, high = task["interval"]
        tokens = task["tokens"]
        lines.append(
            "| "
            + " | ".join(
                [
                    str(task["task"]),
                    f"{task['passed']} of {task['trials']}",
                    f"{_percent(low)} to {_percent(high)}",
                    f"{int(tokens['input']):,} in, {int(tokens['output']):,} out",
                    _cost(int(task["cost"]), priced),
                    "yes" if scripted else "no",
                ]
            )
            + " |"
        )
    if scripted:
        note = "These numbers are scripted: they repeat exactly. A real model's numbers would vary."
    else:
        note = "These numbers come from a live model: they vary from run to run."
    lines.extend(["", note])
    return "\n".join(lines) + "\n"
