"""Evals: many trials of tasks on a board, graded by code and an optional model grader
(ENGINE.md A11.7 and A12.2 and A12.3).

A trial is an ordinary run with seed k (1 to trials) of the task's tape on the board. The code
grader passes a trial whose status is done and whose run_end passed. ``leaked`` is whether a
``leak`` event was emitted. The model grader is a simulated judge drawn from its own PRNG,
seeded seed_base + 1000 * i + k for task i, one draw per trial: it reads the code grade, and
where the code fails it believes a done claim with the false-pass percent.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .board import Board
from .harness import Harness, run_pricing
from .plain import check_plain, loads_strict
from .pricing import resolve_prices
from .prng import Mulberry32
from .spec import EVAL_KINDS, EVAL_MAX_TASKS, EVAL_MAX_TRIALS, NAME_PATTERN
from .tape import Tape, TapeError, load_tape


class EvalError(ValueError):
    """An eval the engine cannot run (a loader refusal, or a tape that does not resolve)."""


@dataclass(frozen=True)
class Task:
    id: str
    tape: str


@dataclass(frozen=True)
class EvalSpec:
    id: str
    title: str
    kind: str
    tasks: tuple[Task, ...]
    trials: int
    boards: tuple[str, ...]
    seed_base: int
    model_grader: dict[str, int] | None


_KEYS = {"id", "schema", "title", "kind", "tasks", "trials", "boards", "seed_base", "model_grader"}
_TASK_KEYS = {"id", "tape"}
_GRADER_KEYS = {"false_pass_percent", "false_fail_percent"}


def _int(value: Any, where: str, low: int, high: int | None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise EvalError(f"{where} must be an integer")
    if value < low or (high is not None and value > high):
        bound = f"{low} to {high}" if high is not None else f"{low} or more"
        raise EvalError(f"{where} must be {bound}, got {value}")
    return value


def eval_from_dict(raw: Any) -> EvalSpec:
    """The eval loader (A11.7, A12.3): every refusal names the field."""
    if not isinstance(raw, dict):
        raise EvalError("eval must be a JSON object")
    try:
        check_plain(raw, "$")
    except ValueError as exc:
        raise EvalError(str(exc)) from exc
    unknown = set(raw) - _KEYS
    if unknown:
        raise EvalError(f"unknown eval field {sorted(unknown)[0]!r}")
    if raw.get("schema") != 1:
        raise EvalError("schema must be 1")
    eval_id = raw.get("id")
    if not isinstance(eval_id, str) or NAME_PATTERN.fullmatch(eval_id) is None:
        raise EvalError("id must match [a-z0-9][a-z0-9-]*")
    title = raw.get("title")
    if not isinstance(title, str) or not title:
        raise EvalError("title must be a non-empty string")
    kind = raw.get("kind")
    if kind not in EVAL_KINDS:
        raise EvalError(f"kind must be capability or regression (A12.3), got {kind!r}")
    tasks_raw = raw.get("tasks")
    if not isinstance(tasks_raw, list) or not 1 <= len(tasks_raw) <= EVAL_MAX_TASKS:
        raise EvalError(f"tasks must be a list of 1 to {EVAL_MAX_TASKS} tasks")
    tasks: list[Task] = []
    seen: set[str] = set()
    for index, item in enumerate(tasks_raw):
        if not isinstance(item, dict) or set(item) != _TASK_KEYS:
            raise EvalError(f"tasks[{index}] must have exactly id and tape")
        task_id = item["id"]
        if not isinstance(task_id, str) or not task_id:
            raise EvalError(f"tasks[{index}].id must be a non-empty string")
        if task_id in seen:
            raise EvalError(f"tasks[{index}]: task id {task_id!r} is repeated")
        seen.add(task_id)
        tape_id = item["tape"]
        if not isinstance(tape_id, str) or NAME_PATTERN.fullmatch(tape_id) is None:
            raise EvalError(f"tasks[{index}].tape must match [a-z0-9][a-z0-9-]* (A12.3)")
        tasks.append(Task(id=task_id, tape=tape_id))
    trials = _int(raw.get("trials"), "trials", 1, EVAL_MAX_TRIALS)
    boards_raw = raw.get("boards")
    if not isinstance(boards_raw, list) or not boards_raw:
        raise EvalError("boards must be a non-empty list")
    if not all(isinstance(b, str) and b for b in boards_raw) or len(set(boards_raw)) != len(
        boards_raw
    ):
        raise EvalError("boards must be distinct non-empty strings (A12.3)")
    seed_base = _int(raw.get("seed_base", 0), "seed_base", 0, None)
    grader: dict[str, int] | None = None
    if "model_grader" in raw:
        grader_raw = raw["model_grader"]
        if not isinstance(grader_raw, dict) or set(grader_raw) != _GRADER_KEYS:
            raise EvalError("model_grader must be an object with the two percents (A12.3)")
        grader = {
            key: _int(grader_raw[key], f"model_grader.{key}", 0, 100)
            for key in sorted(_GRADER_KEYS)
        }
    return EvalSpec(
        id=eval_id,
        title=title,
        kind=str(kind),
        tasks=tuple(tasks),
        trials=trials,
        boards=tuple(boards_raw),
        seed_base=seed_base,
        model_grader=grader,
    )


def load_eval(path: Path) -> EvalSpec:
    try:
        raw: Any = loads_strict(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise EvalError(f"{path}: {exc}") from exc
    return eval_from_dict(raw)


def resolve_tape(tape_id: str, scenarios: Path) -> Path:
    """A11.7: <DIR>/<id>.json, else <DIR>/engine/<id>.json."""
    for candidate in (scenarios / f"{tape_id}.json", scenarios / "engine" / f"{tape_id}.json"):
        if candidate.is_file():
            return candidate
    raise EvalError(f"tape {tape_id!r} resolves to no file under {scenarios}")


def load_tapes(spec: EvalSpec, scenarios: Path) -> dict[str, Tape]:
    tapes: dict[str, Tape] = {}
    for task in spec.tasks:
        if task.tape in tapes:
            continue
        path = resolve_tape(task.tape, scenarios)
        try:
            tapes[task.tape] = load_tape(path)
        except TapeError as exc:
            raise EvalError(str(exc)) from exc
    return tapes


def run_eval(
    spec: EvalSpec,
    tapes: dict[str, Tape],
    board: Board,
    facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The A11.7 object. A board a tape refuses (A8.5) fails the whole eval (BoardError)."""
    results: list[dict[str, Any]] = []
    for index, task in enumerate(spec.tasks):
        tape = tapes[task.tape]
        for trial in range(1, spec.trials + 1):
            prices = resolve_prices(run_pricing(tape, board), facts)
            result = Harness(tape, board, trial, prices).run()
            code = result.status == "done" and result.passed
            row: dict[str, Any] = {
                "task": task.id,
                "trial": trial,
                "status": result.status,
                "passed": result.passed,
                "code": code,
                "leaked": any(event["kind"] == "leak" for event in result.events),
                "turns": result.turns,
                "tokens": {"input": result.tokens_in, "output": result.tokens_out},
                "cost": result.cost,
            }
            if spec.model_grader is not None:
                draw = Mulberry32(spec.seed_base + 1000 * index + trial).percent()
                row["model"] = _model_verdict(spec.model_grader, draw, code, result.status)
            results.append(row)
    return {
        "eval": spec.id,
        "board": board.id,
        "kind": spec.kind,
        "trials": spec.trials,
        "results": results,
        "summary": _summary(spec, results),
    }


def _model_verdict(grader: dict[str, int], draw: int, code: bool, status: str) -> bool:
    if code:
        return draw >= grader["false_fail_percent"]
    if status == "done":  # a false done: the judge believes the claim with the false-pass percent
        return draw < grader["false_pass_percent"]
    return False


def _summary(spec: EvalSpec, results: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "runs": len(results),
        "code": sum(1 for r in results if r["code"]),
        "leaked": sum(1 for r in results if r["leaked"]),
        "tasks": len(spec.tasks),
        "tasks_any_pass": 0,
        "tasks_all_pass": 0,
        "cost": sum(int(r["cost"]) for r in results),
    }
    for task in spec.tasks:
        mine = [r for r in results if r["task"] == task.id]
        if any(r["code"] for r in mine):
            summary["tasks_any_pass"] += 1
        if mine and all(r["code"] for r in mine):
            summary["tasks_all_pass"] += 1
    if spec.model_grader is not None:
        summary["model"] = sum(1 for r in results if r["model"])
        summary["agree"] = sum(1 for r in results if r["model"] == r["code"])
    return summary
