"""The simulator: run_trial, run_bench and the CLI (ENGINE.md section 10; A3.19, A3.21, A3.22).

    python -m rein.sim run --tape T --board B --seed N [--wire] [--choices] [--facts PATH]
    python -m rein.sim eval --eval E --board B [--scenarios DIR] [--facts PATH]   (A11.8)

prints canonical JSONL, one line per record, each ending in a newline: events, or wire payloads
with --wire, or the branch choices ``[location, option]`` with --choices. A run with no lines
prints zero bytes. Errors (including a script that cannot reach a reply) go to stderr with exit
status 2. --facts defaults to site/data/facts.json relative to the working directory; a missing
default file is fine unless the tape's pricing needs it.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .board import Board, BoardError, load_board
from .evals import EvalError, load_eval, load_tapes, run_eval
from .harness import Harness, RunResult, run_pricing
from .model import ScriptError
from .pricing import PricingError, resolve_prices
from .pyjson import trace_line
from .spec import DEFAULT_FACTS_PATH
from .tape import Tape, TapeError, load_tape


@dataclass(frozen=True)
class Trial:
    events: list[dict[str, Any]]
    wire: list[dict[str, Any]]
    result: RunResult


def run_trial(tape: Tape, board: Board, seed: int, facts: dict[str, Any] | None = None) -> Trial:
    prices = resolve_prices(run_pricing(tape, board), facts)
    result = Harness(tape, board, seed, prices).run()
    return Trial(events=result.events, wire=result.wire, result=result)


def run_bench(
    tape: Tape, board: Board, n: int, facts: dict[str, Any] | None = None
) -> dict[str, Any]:
    trials: list[dict[str, Any]] = []
    for index in range(n):
        seed = tape.seed_base + index
        result = run_trial(tape, board, seed, facts).result
        trials.append(
            {
                "seed": seed,
                "status": result.status,
                "passed": result.passed,
                "turns": result.turns,
                "tokens": {"input": result.tokens_in, "output": result.tokens_out},
                "cost": result.cost,
            }
        )
    return {"trials": trials, "passed": sum(1 for t in trials if t["passed"]), "n": n}


def load_facts(path: str | None) -> dict[str, Any] | None:
    """An explicit path must exist. The default is used only when the file is there."""
    if path is None:
        default = Path(DEFAULT_FACTS_PATH)
        if not default.is_file():
            return None
        path_obj = default
    else:
        path_obj = Path(path)
    data: Any = json.loads(path_obj.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise PricingError(f"{path_obj}: the facts file must be a JSON object")
    return data


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m rein.sim")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="run one trial and print JSONL")
    run.add_argument("--tape", type=Path, required=True)
    run.add_argument("--board", type=Path, required=True)
    run.add_argument("--seed", type=int, required=True)
    output = run.add_mutually_exclusive_group()
    output.add_argument("--wire", action="store_true", help="print wire payloads")
    output.add_argument("--choices", action="store_true", help="print branch choices")
    run.add_argument("--facts", default=None, help="facts registry (default: site/data/facts.json)")
    evaluate = commands.add_parser("eval", help="run an eval and print its summary object")
    evaluate.add_argument("--eval", type=Path, required=True)
    evaluate.add_argument("--board", type=Path, required=True)
    evaluate.add_argument("--scenarios", type=Path, default=Path("scenarios"))
    evaluate.add_argument(
        "--facts", default=None, help="facts registry (default: site/data/facts.json)"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "eval":
        return _eval_main(args)
    try:
        tape = load_tape(args.tape)
        board = load_board(args.board)
        facts = load_facts(args.facts)
        if args.seed < 0:
            raise ValueError("--seed must be zero or more")
        trial = run_trial(tape, board, args.seed, facts)
    except (TapeError, BoardError, PricingError, ScriptError, ValueError, OSError) as exc:
        print(f"rein.sim: {exc}", file=sys.stderr)
        return 2
    if args.wire:
        lines = [trace_line(item) for item in trial.wire]
    elif args.choices:
        lines = [trace_line([location, index]) for location, index in trial.result.choices]
    else:
        lines = [trace_line(item) for item in trial.events]
    for line in lines:
        print(line)
    return 0


def _eval_main(args: argparse.Namespace) -> int:
    """A11.8: the eval's object as one canonical JSON line; errors to stderr with exit 2."""
    try:
        spec = load_eval(args.eval)
        board = load_board(args.board)
        facts = load_facts(args.facts)
        tapes = load_tapes(spec, args.scenarios)
        summary = run_eval(spec, tapes, board, facts)
    except (
        EvalError,
        TapeError,
        BoardError,
        PricingError,
        ScriptError,
        ValueError,
        OSError,
    ) as exc:
        print(f"rein.sim: {exc}", file=sys.stderr)
        return 2
    print(trace_line(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
