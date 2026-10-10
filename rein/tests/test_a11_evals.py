"""ENGINE.md A11.7, A11.8 and A12.3: the eval loader, grading, summary, and the eval CLI."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from support import SCENARIOS, make_tape

from rein.board import board_from_dict
from rein.evals import EvalError, _model_verdict, eval_from_dict, load_eval, load_tapes, run_eval
from rein.sim import main as sim_main

EVALS = SCENARIOS / "engine" / "evals"
BOARDS = SCENARIOS / "engine" / "boards"
BASE_EVAL: dict[str, Any] = {
    "id": "e-test",
    "schema": 1,
    "title": "test eval",
    "kind": "regression",
    "tasks": [{"id": "one", "tape": "t-one"}],
    "trials": 2,
    "boards": ["b-one"],
    "seed_base": 3,
}
REFUSALS: list[tuple[dict[str, Any], str]] = [
    ({"kind": "other"}, "kind must be capability or regression"),
    ({"seed_base": -1}, "seed_base must be 0 or more"),
    ({"seed_base": True}, "seed_base must be an integer"),
    ({"seed_base": "7"}, "seed_base must be an integer"),
    ({"boards": []}, "boards must be a non-empty list"),
    ({"boards": ["b", "b"]}, "distinct"),
    ({"boards": [""]}, "distinct"),
    ({"model_grader": None}, "model_grader must be an object"),
    ({"model_grader": {"false_pass_percent": 5}}, "model_grader must be an object"),
    (
        {"model_grader": {"false_pass_percent": 101, "false_fail_percent": 0}},
        "model_grader.false_pass_percent must be 0 to 100",
    ),
    ({"tasks": [{"id": "one", "tape": "Bad_Tape"}]}, "tape must match"),
    ({"tasks": [{"id": "one", "tape": "-leading"}]}, "tape must match"),
    (
        {"tasks": [{"id": "one", "tape": "t-one"}, {"id": "one", "tape": "t-two"}]},
        "repeated",
    ),
    ({"tasks": [{"id": "one", "tape": "t-one", "extra": 1}]}, "exactly id and tape"),
    ({"tasks": []}, "tasks must be a list of 1 to 20"),
    ({"tasks": [{"id": f"t{i}", "tape": "t-one"} for i in range(21)]}, "tasks must be a list"),
    ({"trials": 0}, "trials must be 1 to 50"),
    ({"trials": 51}, "trials must be 1 to 50"),
    ({"id": "Bad"}, "id must match"),
    ({"schema": 2}, "schema must be 1"),
    ({"title": ""}, "title must be a non-empty string"),
    ({"surprise": True}, "unknown eval field"),
]


def spec_with(**changes: Any) -> Any:
    data = copy.deepcopy(BASE_EVAL)
    data.update(changes)
    return eval_from_dict(data)


def write_eval(directory: Path, data: dict[str, Any]) -> Path:
    path = directory / "e-test.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# A11.7 and A12.3: the loader.
def test_a12_3_a_valid_eval_loads() -> None:
    loaded = spec_with(model_grader={"false_pass_percent": 30, "false_fail_percent": 10})
    assert (loaded.id, loaded.kind, loaded.trials, loaded.seed_base) == (
        "e-test",
        "regression",
        2,
        3,
    )
    assert loaded.model_grader == {"false_fail_percent": 10, "false_pass_percent": 30}
    assert loaded.tasks[0].tape == "t-one"


def test_a12_3_seed_base_defaults_to_zero() -> None:
    data = copy.deepcopy(BASE_EVAL)
    del data["seed_base"]
    assert eval_from_dict(data).seed_base == 0


@pytest.mark.parametrize(("changes", "message"), REFUSALS)
def test_a12_3_the_loader_refuses(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(EvalError, match=message):
        spec_with(**changes)


def test_a12_3_the_shipped_evals_load() -> None:
    regression = load_eval(EVALS / "eng-eval.json")
    assert regression.kind == "regression"
    assert regression.boards == ("eng-tamper-plain", "eng-tamper-pristine")
    assert regression.model_grader == {"false_fail_percent": 10, "false_pass_percent": 30}
    capability = load_eval(EVALS / "eng-eval-attack.json")
    assert capability.kind == "capability"
    assert capability.model_grader is None
    assert capability.trials == 10


def test_a11_7_a_missing_tape_is_named(tmp_path: Path) -> None:
    spec = load_eval(write_eval(tmp_path, copy.deepcopy(BASE_EVAL)))
    with pytest.raises(EvalError, match="t-one' resolves to no file"):
        load_tapes(spec, tmp_path)


def test_a11_7_tapes_resolve_in_the_engine_folder() -> None:
    tapes = load_tapes(load_eval(EVALS / "eng-eval.json"), SCENARIOS)
    assert set(tapes) == {"eng-tamper", "eng-overrides"}


# A12.3: grading.
def test_a12_3_model_verdict_follows_the_draw() -> None:
    grader = {"false_pass_percent": 30, "false_fail_percent": 10}
    assert _model_verdict(grader, 50, True, "done") is True
    assert _model_verdict(grader, 5, True, "done") is False
    assert _model_verdict(grader, 20, False, "done") is True
    assert _model_verdict(grader, 40, False, "done") is False
    assert _model_verdict(grader, 0, False, "max_turns") is False


def passing_tape() -> Any:
    return make_tape()


def failing_tape() -> Any:
    return make_tape(checks=[{"file": "a.txt", "contains": "absent-text"}])


def leaking_tape() -> Any:
    post = {
        "name": "post",
        "description": "Post a note.",
        "effect": "network",
        "trifecta": ["exfiltration"],
        "input_schema": {
            "type": "object",
            "properties": {"body": {"type": "string"}},
            "required": ["body"],
            "additionalProperties": False,
        },
        "latency_ms": 100,
        "results": [],
        "default": {"output": "Posted.", "ok": True},
    }
    script = [
        {"say": "send", "tools": [["post", {"body": "CANARY-1"}]]},
        {"say": "done", "stop": "end_turn"},
    ]
    return make_tape(canaries=["CANARY-1"], custom_tools=[post], script=script)


def two_task_spec(**changes: Any) -> Any:
    tasks = [{"id": "good", "tape": "t-good"}, {"id": "bad", "tape": "t-bad"}]
    return spec_with(tasks=tasks, trials=2, **changes)


def test_a11_7_the_summary_counts_runs_and_tasks() -> None:
    eval_spec = two_task_spec()
    tapes = {"t-good": passing_tape(), "t-bad": failing_tape()}
    result = run_eval(
        eval_spec, tapes, board_from_dict({"id": "b-one", "label": "B", "modules": {}})
    )
    assert (result["eval"], result["board"], result["kind"], result["trials"]) == (
        "e-test",
        "b-one",
        "regression",
        2,
    )
    assert [(row["task"], row["trial"]) for row in result["results"]] == [
        ("good", 1),
        ("good", 2),
        ("bad", 1),
        ("bad", 2),
    ]
    summary = result["summary"]
    assert summary["runs"] == 4
    assert summary["code"] == 2
    assert summary["leaked"] == 0
    assert summary["tasks"] == 2
    assert summary["tasks_any_pass"] == 1
    assert summary["tasks_all_pass"] == 1
    assert summary["cost"] == sum(row["cost"] for row in result["results"])
    assert "model" not in summary


def test_a11_7_leaks_are_counted_per_run() -> None:
    eval_spec = spec_with(tasks=[{"id": "leaky", "tape": "t-leak"}], trials=2)
    result = run_eval(
        eval_spec,
        {"t-leak": leaking_tape()},
        board_from_dict({"id": "b-one", "label": "B", "modules": {}}),
    )
    assert result["summary"]["leaked"] == 2
    assert all(row["leaked"] for row in result["results"])


def test_a12_3_the_model_grader_adds_model_and_agree() -> None:
    grader = {"false_pass_percent": 30, "false_fail_percent": 10}
    eval_spec = two_task_spec(model_grader=grader)
    tapes = {"t-good": passing_tape(), "t-bad": failing_tape()}
    result = run_eval(
        eval_spec, tapes, board_from_dict({"id": "b-one", "label": "B", "modules": {}})
    )
    summary = result["summary"]
    assert summary["agree"] == sum(1 for row in result["results"] if row["model"] == row["code"])
    assert summary["model"] == sum(1 for row in result["results"] if row["model"])


# A11.8: the eval CLI.
def test_a11_8_the_cli_prints_one_summary_line(capsys: pytest.CaptureFixture[str]) -> None:
    code = sim_main(
        [
            "eval",
            "--eval",
            str(EVALS / "eng-eval.json"),
            "--board",
            str(BOARDS / "eng-tamper-plain.json"),
            "--scenarios",
            str(SCENARIOS),
        ]
    )
    captured = capsys.readouterr()
    assert code == 0
    assert captured.err == ""
    assert captured.out.count("\n") == 1
    summary = json.loads(captured.out)
    assert summary["eval"] == "eng-eval"
    assert summary["board"] == "eng-tamper-plain"
    assert summary["summary"]["runs"] == 15


def test_a11_8_a_missing_eval_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = sim_main(
        [
            "eval",
            "--eval",
            str(tmp_path / "missing.json"),
            "--board",
            str(BOARDS / "eng-tamper-plain.json"),
        ]
    )
    captured = capsys.readouterr()
    assert code == 2
    assert captured.out == ""
    assert captured.err.startswith("rein.sim: ")


def test_a11_8_a_refused_eval_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    data = copy.deepcopy(BASE_EVAL)
    data["kind"] = "other"
    code = sim_main(
        [
            "eval",
            "--eval",
            str(write_eval(tmp_path, data)),
            "--board",
            str(BOARDS / "eng-tamper-plain.json"),
        ]
    )
    captured = capsys.readouterr()
    assert code == 2
    assert "kind must be capability or regression" in captured.err


def test_a11_8_an_unresolvable_tape_exits_2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = sim_main(
        [
            "eval",
            "--eval",
            str(write_eval(tmp_path, copy.deepcopy(BASE_EVAL))),
            "--board",
            str(BOARDS / "eng-tamper-plain.json"),
            "--scenarios",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    assert code == 2
    assert "resolves to no file" in captured.err


def test_a12_3_the_board_need_not_be_one_of_the_evals_boards(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = sim_main(
        [
            "eval",
            "--eval",
            str(EVALS / "eng-eval.json"),
            "--board",
            str(BOARDS / "eng-inject-open.json"),
            "--scenarios",
            str(SCENARIOS),
        ]
    )
    captured = capsys.readouterr()
    assert code == 0
    assert json.loads(captured.out)["board"] == "eng-inject-open"
