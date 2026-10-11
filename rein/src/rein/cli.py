"""The command line of the local package (BP-4.2 §2): ``python -m rein``.

    rein run     --tape T --board B [--seed N] [--wire | --choices] [--facts P]
    rein run     --tape T --board B --live MODEL --max-cost-usd X [--seed N] [--wire] [--facts P]
    rein eval    --eval E --board B [--scenarios DIR] [--out results.json] [--facts P]
    rein eval    --eval E --board B --live MODEL --max-cost-usd X [--trials N] [--out results.json]
    rein results results.json --markdown

``python -m rein.sim`` keeps working as before. Errors are one line on stderr with exit status 2,
and the learner's key is redacted from every error text. The key is read from
ANTHROPIC_API_KEY only; there is no flag for it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

from .board import BoardError, load_board
from .evals import EvalError, load_eval, load_tapes, run_eval
from .harness import Harness, run_pricing
from .live import (
    KEY_ENV,
    LiveError,
    LiveModel,
    SpendCap,
    check_model,
    key_from_env,
    live_prices,
    make_client,
    redact,
    run_live_eval,
)
from .model import ScriptError
from .pricing import PricingError
from .pyjson import trace_line
from .results import ResultsError, build_results, read_results, render_markdown, write_results
from .sim import load_facts, run_trial
from .spec import DEFAULT_FACTS_PATH
from .tape import TapeError, load_tape

# read by the SDK too; the CLI passes it through explicitly
BASE_URL_ENV = "ANTHROPIC_BASE_URL"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m rein")
    commands = parser.add_subparsers(dest="command", required=True)

    run = commands.add_parser("run", help="run one trial, scripted or live, and print JSONL")
    run.add_argument("--tape", type=Path, required=True)
    run.add_argument("--board", type=Path, required=True)
    run.add_argument("--seed", type=int, default=0)
    output = run.add_mutually_exclusive_group()
    output.add_argument("--wire", action="store_true", help="print the wire payloads")
    output.add_argument("--choices", action="store_true", help="print the branch choices")
    run.add_argument("--live", metavar="MODEL_ID", default=None, help="a real model (BP-4.2)")
    run.add_argument("--max-cost-usd", type=float, default=None, help="the spend cap; live runs")
    run.add_argument("--facts", default=None, help="facts registry (default: site/data/facts.json)")

    evaluate = commands.add_parser("eval", help="run an eval and write its results file")
    evaluate.add_argument("--eval", type=Path, required=True)
    evaluate.add_argument("--board", type=Path, required=True)
    evaluate.add_argument(
        "--scenarios", type=Path, default=None, help="tapes (default: the eval's scenarios folder)"
    )
    evaluate.add_argument("--live", metavar="MODEL_ID", default=None)
    evaluate.add_argument("--max-cost-usd", type=float, default=None)
    evaluate.add_argument("--trials", type=int, default=None, help="trials per task (live runs)")
    evaluate.add_argument("--out", type=Path, default=None, help="the results file to write")
    evaluate.add_argument("--facts", default=None, help="facts registry")

    results = commands.add_parser("results", help="print a results file as the course's table")
    results.add_argument("file", type=Path)
    results.add_argument("--markdown", action="store_true")
    return parser


def _facts_for(explicit: str | None, anchor: Path) -> dict[str, Any] | None:
    """The facts registry: --facts when given (it must exist), else site/data/facts.json under the
    working directory or at the repository root above the scenarios folder (``anchor``)."""
    if explicit is not None:
        return load_facts(explicit)
    for candidate in (Path(DEFAULT_FACTS_PATH), anchor.resolve().parent / DEFAULT_FACTS_PATH):
        if candidate.is_file():
            return load_facts(str(candidate))
    return None


def _require_cap(args: argparse.Namespace) -> None:
    if args.max_cost_usd is None:
        raise LiveError("--max-cost-usd is required for live runs")
    SpendCap.from_usd(args.max_cost_usd)  # refuses zero, negative, nan and inf before any request


def _live_model(model_id: str, max_cost_usd: float, facts: dict[str, Any] | None) -> LiveModel:
    """The live model for one run: the key from the environment, the model id checked against the
    Models API, its dated prices from the facts, and the spend cap."""
    key = key_from_env(os.environ)
    client = make_client(key, os.environ.get(BASE_URL_ENV) or None)
    check_model(client, model_id)
    prices, ceiling = live_prices(model_id, facts)
    return LiveModel(
        model_id=model_id,
        client=client,
        prices=prices,
        cap=SpendCap.from_usd(max_cost_usd),
        max_prompt_tokens=ceiling,
    )


def _refuse_subagents(board: Any) -> None:
    if board.has("subagents"):
        raise LiveError("live runs do not support sub-agents yet (BP-4.2)")


def _run(args: argparse.Namespace) -> int:
    tape = load_tape(args.tape)
    board = load_board(args.board)
    facts = _facts_for(args.facts, args.tape.resolve().parent)
    if args.seed < 0:
        raise ValueError("--seed must be zero or more")
    if args.live is None:
        trial = run_trial(tape, board, args.seed, facts)
        if args.wire:
            items: list[Any] = trial.wire
        elif args.choices:
            items = [[location, index] for location, index in trial.result.choices]
        else:
            items = trial.events
    else:
        _require_cap(args)
        _refuse_subagents(board)
        model = _live_model(args.live, args.max_cost_usd, facts)
        result = Harness(tape, board, args.seed, model.prices, live=model).run()
        items = result.wire if args.wire else result.events
    for item in items:
        print(trace_line(item))
    return 0


def _eval(args: argparse.Namespace) -> int:
    spec = load_eval(args.eval)
    board = load_board(args.board)
    scenarios = args.scenarios if args.scenarios is not None else args.eval.resolve().parent.parent
    facts = _facts_for(args.facts, scenarios)
    tapes = load_tapes(spec, scenarios)
    if args.live is None:
        if args.trials is not None or args.max_cost_usd is not None:
            raise ValueError(
                "--trials and --max-cost-usd apply to live runs; "
                "a scripted eval uses the spec's trials"
            )
        summary = run_eval(spec, tapes, board, facts)
        rows: list[dict[str, Any]] = summary["results"]
        trials = spec.trials
        scripted = True
        priced = all("fact" in run_pricing(tape, board) for tape in tapes.values())
        model_id = next(iter(tapes.values())).model_id
    else:
        _require_cap(args)
        _refuse_subagents(board)
        trials = args.trials if args.trials is not None else spec.trials
        if trials < 1:
            raise ValueError("--trials must be one or more")
        live = _live_model(args.live, args.max_cost_usd, facts)
        rows = run_live_eval(
            spec,
            tapes,
            board,
            live.client,
            args.live,
            live.prices,
            live.max_prompt_tokens,
            live.cap,
            trials,
        )
        scripted = False
        priced = True
        model_id = args.live
    results = build_results(
        eval_id=spec.id,
        board=board.id,
        model=model_id,
        date=date.today().isoformat(),
        scripted=scripted,
        priced=priced,
        trials=trials,
        rows=rows,
    )
    if args.out is not None:
        write_results(args.out, results)
    sys.stdout.write(render_markdown(results))
    return 0


def _results(args: argparse.Namespace) -> int:
    data = read_results(args.file)
    if args.markdown:
        sys.stdout.write(render_markdown(data))
    else:
        print(json.dumps(data, indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    key = os.environ.get(KEY_ENV) or None
    try:
        if args.command == "run":
            return _run(args)
        if args.command == "eval":
            return _eval(args)
        return _results(args)
    except (
        BoardError,
        EvalError,
        LiveError,
        PricingError,
        ResultsError,
        ScriptError,
        TapeError,
        OSError,
        ValueError,
    ) as exc:
        print(f"rein: {redact(str(exc), key)}", file=sys.stderr)
        return 2
