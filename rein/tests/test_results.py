"""The results of an eval (BP-4.2 §3): the Wilson 95% interval and the course's table."""

from __future__ import annotations

import pytest

from rein.results import COLUMNS, build_results, render_markdown, wilson_interval


def test_the_wilson_interval_matches_its_closed_form() -> None:
    low, high = wilson_interval(4, 5)
    assert low == pytest.approx(0.3755, abs=1e-3)
    assert high == pytest.approx(0.9638, abs=1e-3)


def test_the_interval_of_no_passes_and_of_all_passes_stays_inside_zero_and_one() -> None:
    low, high = wilson_interval(0, 10)
    assert low == 0.0 and high == pytest.approx(0.2775, abs=1e-3)
    low, high = wilson_interval(10, 10)
    assert low == pytest.approx(0.7225, abs=1e-3) and high == 1.0


def test_no_trials_gives_the_whole_range() -> None:
    assert wilson_interval(0, 0) == (0.0, 1.0)


def test_the_table_has_exactly_the_six_columns_the_portfolio_projects_name() -> None:
    assert COLUMNS == (
        "Task",
        "Passed of trials",
        "Wilson 95% interval",
        "Tokens",
        "Cost",
        "Scripted",
    )
    rows = [
        {
            "task": "t",
            "trial": 1,
            "code": True,
            "passed": True,
            "tokens": {"input": 1, "output": 2},
            "cost": 2000000,
        },
        {
            "task": "t",
            "trial": 2,
            "code": False,
            "passed": False,
            "tokens": {"input": 3, "output": 4},
            "cost": 1000000,
        },
    ]
    results = build_results(
        eval_id="e",
        board="b",
        model="m",
        date="2026-10-11",
        scripted=True,
        priced=True,
        trials=2,
        rows=rows,
    )
    table = render_markdown(results)
    assert (
        table.splitlines()[0]
        == "| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |"
    )
    assert "| t | 1 of 2 |" in table
    assert "| 4 in, 6 out | $0.0030 | yes |" in table


def test_scripted_and_live_tables_say_which_they_are() -> None:
    base = {
        "eval": "e",
        "board": "b",
        "model": "m",
        "date": "d",
        "trials": 1,
        "priced": True,
        "tasks": [
            {
                "task": "t",
                "passed": 1,
                "trials": 1,
                "interval": [0.2, 1.0],
                "tokens": {"input": 0, "output": 0},
                "cost": 0,
            }
        ],
    }
    scripted = render_markdown(dict(base, scripted=True))
    live = render_markdown(dict(base, scripted=False))
    assert "These numbers are scripted: they repeat exactly." in scripted
    assert "come from a live model" in live
    assert "| yes |" in scripted and "| no |" in live


def test_a_cost_in_units_is_not_shown_as_dollars() -> None:
    results = {
        "eval": "e",
        "board": "b",
        "model": "m",
        "date": "d",
        "trials": 1,
        "scripted": True,
        "priced": False,
        "tasks": [
            {
                "task": "t",
                "passed": 0,
                "trials": 1,
                "interval": [0.0, 0.8],
                "tokens": {"input": 0, "output": 0},
                "cost": 2000000000,
            }
        ],
    }
    assert "2.0000 units" in render_markdown(results)
    assert "$" not in render_markdown(results).splitlines()[2]
