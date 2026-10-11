"""The command line for live runs and results (BP-4.2 §2 and §3), against the local mock. The key is
set in the environment only, and no output, trace or file may contain it."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from live_mock import MockAnthropic, load_exchange
from support import BASE_TAPE, BOARDS, FACTS_PATH, SCENARIOS

from rein.cli import main
from rein.results import COLUMNS

SENTINEL = "sk-ant-test-SENTINEL-41d0a2"
HEADER = "| " + " | ".join(COLUMNS) + " |"


@pytest.fixture
def workspace(tmp_path: Path) -> dict[str, Path]:
    """A tape and a board of the mock's own, plus an eval over that tape, in a temporary folder."""
    scenarios = tmp_path / "scenarios"
    scenarios.mkdir()
    tape = dict(BASE_TAPE, id="t-live")
    (scenarios / "t-live.json").write_text(json.dumps(tape), encoding="utf-8")
    boards = tmp_path / "boards"
    boards.mkdir()
    board = boards / "b.json"
    board.write_text(json.dumps({"id": "b", "label": "B", "modules": {}}), encoding="utf-8")
    evals = tmp_path / "evals"
    evals.mkdir()
    spec = {
        "schema": 1,
        "id": "t-live-eval",
        "title": "A live eval over one tape",
        "kind": "capability",
        "tasks": [{"id": "read-a", "tape": "t-live"}],
        "trials": 2,
        "boards": ["b"],
        "seed_base": 0,
    }
    (evals / "t-live-eval.json").write_text(json.dumps(spec), encoding="utf-8")
    return {
        "tape": scenarios / "t-live.json",
        "board": board,
        "eval": evals / "t-live-eval.json",
        "scenarios": scenarios,
        "out": tmp_path / "results.json",
    }


def live_env(monkeypatch: pytest.MonkeyPatch, base_url: str, key: str = SENTINEL) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", key)
    monkeypatch.setenv("ANTHROPIC_BASE_URL", base_url)


def test_a_live_run_prints_the_events_and_never_prints_the_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        live_env(monkeypatch, mock.url)
        code = main(
            [
                "run",
                "--tape",
                str(workspace["tape"]),
                "--board",
                str(workspace["board"]),
                "--live",
                "claude-sonnet-5-5",
                "--max-cost-usd",
                "1",
                "--facts",
                str(FACTS_PATH),
            ]
        )
    captured = capsys.readouterr()
    assert code == 0
    assert SENTINEL not in captured.out and SENTINEL not in captured.err
    events = [json.loads(line) for line in captured.out.splitlines()]
    assert [e["kind"] for e in events if e["kind"] == "model_reply"]
    assert [e for e in events if e["kind"] == "run_end"][0]["status"] == "done"


def _live_run_args(workspace: dict[str, Path], cap: str | None) -> list[str]:
    args = [
        "run",
        "--tape",
        str(workspace["tape"]),
        "--board",
        str(workspace["board"]),
        "--live",
        "claude-sonnet-5-5",
        "--facts",
        str(FACTS_PATH),
    ]
    return args if cap is None else [*args, "--max-cost-usd", cap]


@pytest.mark.parametrize(
    "body",
    [
        pytest.param("<html><body>portal</body></html>", id="html-page"),
        pytest.param(
            {"id": "msg_1", "type": "message", "role": "assistant", "content": []},
            id="message-without-usage",
        ),
    ],
)
def test_a_200_that_is_not_a_reply_exits_two_on_one_line(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    workspace: dict[str, Path],
    body: Any,
) -> None:
    with MockAnthropic([(200, body, {})]) as mock:
        live_env(monkeypatch, mock.url)
        code = main(_live_run_args(workspace, "1"))
    captured = capsys.readouterr()
    assert code == 2
    lines = captured.err.splitlines()
    assert len(lines) == 1 and lines[0].startswith("rein: "), captured.err
    assert "Traceback" not in captured.err and SENTINEL not in captured.err


@pytest.mark.parametrize("cap", ["inf", "nan", "0", "-1"])
def test_an_unusable_cap_is_refused_before_any_request(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    workspace: dict[str, Path],
    cap: str,
) -> None:
    with MockAnthropic([]) as mock:
        live_env(monkeypatch, mock.url)
        code = main(_live_run_args(workspace, cap))
        assert mock.requests == []
    captured = capsys.readouterr()
    assert code == 2
    assert "--max-cost-usd must be a finite number above zero" in captured.err


def test_a_live_run_without_a_cap_is_refused(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    with MockAnthropic([]) as mock:
        live_env(monkeypatch, mock.url)
        code = main(
            [
                "run",
                "--tape",
                str(workspace["tape"]),
                "--board",
                str(workspace["board"]),
                "--live",
                "claude-sonnet-5-5",
                "--facts",
                str(FACTS_PATH),
            ]
        )
        assert mock.requests == []
    captured = capsys.readouterr()
    assert code == 2
    assert "--max-cost-usd is required for live runs" in captured.err


def test_a_missing_key_is_named_by_its_variable_and_never_shown(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    code = main(
        [
            "run",
            "--tape",
            str(workspace["tape"]),
            "--board",
            str(workspace["board"]),
            "--live",
            "claude-sonnet-5-5",
            "--max-cost-usd",
            "1",
            "--facts",
            str(FACTS_PATH),
        ]
    )
    captured = capsys.readouterr()
    assert code == 2
    assert "ANTHROPIC_API_KEY" in captured.err


def test_an_unlisted_model_exits_two_and_names_the_id(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    with MockAnthropic([]) as mock:
        live_env(monkeypatch, mock.url)
        code = main(
            [
                "run",
                "--tape",
                str(workspace["tape"]),
                "--board",
                str(workspace["board"]),
                "--live",
                "claude-unknown-9",
                "--max-cost-usd",
                "1",
                "--facts",
                str(FACTS_PATH),
            ]
        )
    captured = capsys.readouterr()
    assert code == 2
    assert "claude-unknown-9" in captured.err and "not listed" in captured.err
    assert SENTINEL not in captured.err


def test_an_unauthorized_run_exits_two_without_the_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    with MockAnthropic(load_exchange("unauthorized")) as mock:
        live_env(monkeypatch, mock.url)
        code = main(
            [
                "run",
                "--tape",
                str(workspace["tape"]),
                "--board",
                str(workspace["board"]),
                "--live",
                "claude-sonnet-5-5",
                "--max-cost-usd",
                "1",
                "--facts",
                str(FACTS_PATH),
            ]
        )
    captured = capsys.readouterr()
    assert code == 2
    assert SENTINEL not in captured.err and SENTINEL not in captured.out
    assert "ANTHROPIC_API_KEY" in captured.err


def test_a_live_eval_writes_a_results_file_and_prints_the_table(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    workspace: dict[str, Path],
) -> None:
    # Each trial is one tool-using run: two replies. Two trials need four replies.
    exchange = load_exchange("tool_then_done") * 2
    with MockAnthropic(exchange) as mock:
        live_env(monkeypatch, mock.url)
        code = main(
            [
                "eval",
                "--eval",
                str(workspace["eval"]),
                "--board",
                str(workspace["board"]),
                "--scenarios",
                str(workspace["scenarios"]),
                "--live",
                "claude-sonnet-5-5",
                "--max-cost-usd",
                "1",
                "--trials",
                "2",
                "--out",
                str(workspace["out"]),
                "--facts",
                str(FACTS_PATH),
            ]
        )
    captured = capsys.readouterr()
    assert code == 0
    assert HEADER in captured.out
    assert "come from a live model" in captured.out
    data: dict[str, Any] = json.loads(workspace["out"].read_text(encoding="utf-8"))
    assert data["scripted"] is False
    assert data["priced"] is True
    assert data["model"] == "claude-sonnet-5-5"
    task = data["tasks"][0]
    assert (task["passed"], task["trials"]) == (2, 2)
    raw = workspace["out"].read_text(encoding="utf-8")
    assert SENTINEL not in raw and SENTINEL not in captured.out and SENTINEL not in captured.err


def test_results_markdown_prints_the_six_columns_and_says_whether_numbers_are_scripted(
    capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    results = {
        "eval": "t",
        "board": "b",
        "model": "m",
        "date": "2026-10-11",
        "trials": 2,
        "scripted": True,
        "priced": False,
        "tasks": [
            {
                "task": "read-a",
                "passed": 1,
                "trials": 2,
                "interval": [0.0, 0.8],
                "tokens": {"input": 10, "output": 4},
                "cost": 1500000000,
            },
        ],
    }
    workspace["out"].write_text(json.dumps(results), encoding="utf-8")
    code = main(["results", str(workspace["out"]), "--markdown"])
    out = capsys.readouterr().out
    assert code == 0
    assert out.splitlines()[0] == HEADER
    assert "| read-a | 1 of 2 | 0.0% to 80.0% | 10 in, 4 out | 1.5000 units | yes |" in out
    assert "These numbers are scripted" in out


def test_a_scripted_eval_on_the_course_suite_is_marked_scripted(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    out = tmp_path / "suite.json"
    code = main(
        [
            "eval",
            "--eval",
            str(SCENARIOS / "evals" / "d1-suite.json"),
            "--board",
            str(BOARDS / "d1-new.json"),
            "--out",
            str(out),
            "--facts",
            str(FACTS_PATH),
        ]
    )
    captured = capsys.readouterr()
    assert code == 0
    assert captured.out.splitlines()[0] == HEADER
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["scripted"] is True
    assert all(task["trials"] == data["trials"] for task in data["tasks"])


def test_the_trials_flag_is_for_live_runs_only(
    capsys: pytest.CaptureFixture[str], workspace: dict[str, Path]
) -> None:
    code = main(
        [
            "eval",
            "--eval",
            str(workspace["eval"]),
            "--board",
            str(workspace["board"]),
            "--scenarios",
            str(workspace["scenarios"]),
            "--trials",
            "3",
            "--facts",
            str(FACTS_PATH),
        ]
    )
    assert code == 2
    assert "apply to live runs" in capsys.readouterr().err
