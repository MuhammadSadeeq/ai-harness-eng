"""check_wire: validate the Python wire payloads against the anthropic 1.8.0 types (D-019).

The wire payloads are produced live by Rein for every tape x board x golden seed (A3.23): each
is either a request (``{"model", "max_tokens", "system", "tools", "messages"}``) or a response
(``{"id", "type": "message", ...}``) from ENGINE.md section 10. No golden files are read.

* Requests: ``messages`` validate with ``TypeAdapter(list[MessageParam])`` and ``tools`` with
  ``TypeAdapter(list[ToolParam])``. TypedDict validation is lazy (D-019), so the nested content
  lists are materialized and their key sets are compared here, rejecting unknown and missing keys.
* Responses: ``anthropic.types.Message.model_validate``, plus key-set checks (the SDK models allow
  extra keys) for the response, its content blocks and its usage.

Last line: ``check_wire: <n> payloads OK``, or ``check_wire: FAILED (<k> problems)``.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import typing
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, get_args, get_origin, get_type_hints

import anthropic.types as sdk
from pydantic import BaseModel, TypeAdapter, ValidationError

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIOS = REPO_ROOT / "scenarios"
DEFAULT_FACTS = REPO_ROOT / "site" / "data" / "facts.json"
REQUEST_KEYS = ("model", "max_tokens", "messages", "tools", "system", "output_config")
REQUIRED_REQUEST_KEYS = ("model", "max_tokens", "messages", "tools")
MESSAGE_TYPE = "message"


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


@dataclass
class Report:
    problems: list[Problem] = field(default_factory=list)
    payloads: int = 0

    def error(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message))


def _required(typed_dict: type) -> set[str]:
    hints = get_type_hints(typed_dict, include_extras=True)
    return {name for name, hint in hints.items() if get_origin(hint) is typing.Required}


def _hints(typed_dict: type) -> set[str]:
    return set(get_type_hints(typed_dict))


def _block_types() -> dict[str, type]:
    """Request content block TypedDicts keyed by their `type` literal."""
    mapping: dict[str, type] = {}
    for member in get_args(sdk.ContentBlockParam):
        literal = get_args(get_type_hints(member)["type"])[0]
        mapping[str(literal)] = member
    return mapping


_BLOCKS = _block_types()
_MESSAGE_PARAM = TypeAdapter(list[sdk.MessageParam])
_TOOL_PARAM = TypeAdapter(list[sdk.ToolParam])


def _materialize(value: Any) -> Any:
    """Turn lazy iterables from validation into lists, so nested errors surface."""
    if isinstance(value, dict):
        return {key: _materialize(item) for key, item in value.items()}
    if isinstance(value, list | tuple | Iterator):
        return [_materialize(item) for item in value]
    return value


def _check_keys(
    data: Any, allowed: set[str], required: set[str], where: str, problems: list[str]
) -> bool:
    if not isinstance(data, dict):
        problems.append(f"{where}: expected an object")
        return False
    unknown = sorted(set(data) - allowed)
    missing = sorted(required - set(data))
    for key in unknown:
        problems.append(f"{where}: unknown key {key!r}")
    for key in missing:
        problems.append(f"{where}: missing key {key!r}")
    return not unknown and not missing


def _check_block(block: Any, where: str, problems: list[str]) -> None:
    if not isinstance(block, dict) or "type" not in block:
        problems.append(f"{where}: a content block needs a type")
        return
    member = _BLOCKS.get(str(block["type"]))
    if member is None:
        problems.append(f"{where}: unknown block type {block['type']!r}")
        return
    if not _check_keys(block, _hints(member), _required(member), where, problems):
        return
    if block["type"] == "tool_result" and isinstance(block.get("content"), list):
        for index, inner in enumerate(block["content"]):
            _check_block(inner, f"{where}.content[{index}]", problems)


def _check_message(message: Any, where: str, problems: list[str]) -> None:
    if not _check_keys(
        message, _hints(sdk.MessageParam), _required(sdk.MessageParam), where, problems
    ):
        return
    content = message["content"]
    if isinstance(content, list):
        for index, block in enumerate(content):
            _check_block(block, f"{where}.content[{index}]", problems)


def check_request(
    payload: dict[str, Any], where: str, problems: list[str], sent: frozenset[str] = frozenset()
) -> None:
    # `sent`: the keys the run's board adds on purpose with request_params (A14.5), such as a
    # parameter a newer API no longer takes: the lesson is the harness sending it.
    _check_keys(payload, set(REQUEST_KEYS) | sent, set(REQUIRED_REQUEST_KEYS), where, problems)
    if "output_config" in payload:  # A7.3: the effort level (anthropic 1.8.0 OutputConfigParam)
        _check_keys(
            payload["output_config"],
            _hints(sdk.OutputConfigParam),
            _required(sdk.OutputConfigParam),
            f"{where}.output_config",
            problems,
        )
    try:
        _materialize(_MESSAGE_PARAM.validate_python(payload.get("messages", [])))
        _TOOL_PARAM.validate_python(payload.get("tools", []))
    except ValidationError as exc:
        # Still run the key-set walk below: it names the missing or unknown key.
        problems.append(f"{where}: {exc.errors()[0]['msg']} at {exc.errors()[0]['loc']}")
    for index, message in enumerate(payload.get("messages", [])):
        _check_message(message, f"{where}.messages[{index}]", problems)
    for index, tool in enumerate(payload.get("tools", [])):
        _check_keys(
            tool,
            _hints(sdk.ToolParam),
            _required(sdk.ToolParam),
            f"{where}.tools[{index}]",
            problems,
        )


def check_response(payload: dict[str, Any], where: str, problems: list[str]) -> None:
    fields = set(sdk.Message.model_fields)
    required = {name for name, info in sdk.Message.model_fields.items() if info.is_required()}
    _check_keys(payload, fields, required, where, problems)
    if payload.get("type") != MESSAGE_TYPE:
        problems.append(f"{where}: type must be {MESSAGE_TYPE!r}")
    try:
        sdk.Message.model_validate(payload)
    except ValidationError as exc:
        problems.append(f"{where}: {exc.errors()[0]['msg']} at {exc.errors()[0]['loc']}")
    for index, block in enumerate(payload.get("content", [])):
        _check_response_block(block, f"{where}.content[{index}]", problems)
    usage_fields = set(sdk.Usage.model_fields)
    usage_required = {n for n, i in sdk.Usage.model_fields.items() if i.is_required()}
    _check_keys(payload.get("usage"), usage_fields, usage_required, f"{where}.usage", problems)


def _check_response_block(block: Any, where: str, problems: list[str]) -> None:
    if not isinstance(block, dict):
        problems.append(f"{where}: expected an object")
        return
    block_type = str(block.get("type", ""))
    member = _response_block(block_type)
    if member is None:
        problems.append(f"{where}: unknown response block type {block_type!r}")
        return
    fields = set(member.model_fields)
    required = {n for n, i in member.model_fields.items() if i.is_required()}
    _check_keys(block, fields, required, where, problems)


def _response_block(block_type: str) -> type[BaseModel] | None:
    for member in get_args(get_args(sdk.ContentBlock)[0]):
        if not isinstance(member, type) or not issubclass(member, BaseModel):
            continue
        literal = member.model_fields["type"].annotation
        if block_type in [str(a) for a in get_args(literal)]:
            return member
    return None


def payload_problems(line: str, where: str, sent: frozenset[str] = frozenset()) -> list[str]:
    problems: list[str] = []
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        return [f"{where}: not valid JSON ({exc.msg})"]
    if not isinstance(payload, dict):
        return [f"{where}: a payload must be a JSON object"]
    if payload.get("type") == MESSAGE_TYPE or "stop_reason" in payload:
        check_response(payload, where, problems)
    else:
        check_request(payload, where, problems, sent)
    return problems


def check_lines(
    lines: list[str], where: str, report: Report, sent: frozenset[str] = frozenset()
) -> None:
    """Validate JSONL payload lines; every line is one payload."""
    for number, line in enumerate(lines, start=1):
        report.payloads += 1
        for message in payload_problems(line, where, sent):
            report.error(where, number, message)


def live_wire(
    scenarios_dir: Path, facts_path: Path
) -> Iterator[tuple[str, list[str], frozenset[str]]]:
    """A3.23: the wire of every run, produced live by Rein (no golden files are read).

    Yields (where, canonical JSONL lines, the board's request_params keys) for each tape x its
    boards x its golden seeds."""
    src = str(REPO_ROOT / "rein" / "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    tape_module = importlib.import_module("rein.tape")
    board_module = importlib.import_module("rein.board")
    sim_module = importlib.import_module("rein.sim")
    trace_line = importlib.import_module("rein.pyjson").trace_line
    facts: dict[str, Any] | None = None
    if facts_path.is_file():
        facts = json.loads(facts_path.read_text(encoding="utf-8"))
    # The incident tapes and the engine tapes (A8.6, scenarios/engine/) each use their own boards.
    engine = scenarios_dir / "engine"
    sources = [
        (tape_path, scenarios_dir / "boards")
        for tape_path in sorted(
            p for p in scenarios_dir.glob("*.json") if not p.name.endswith("schema.json")
        )
    ] + [(tape_path, engine / "boards") for tape_path in sorted(engine.glob("*.json"))]
    for tape_path, boards_dir in sources:
        tape = tape_module.load_tape(tape_path)
        for board_id in tape.boards:
            board_path = boards_dir / f"{board_id}.json"
            board = board_module.load_board(board_path)
            sent = frozenset(board.modules.get("request_params", {}))
            for seed in tape.golden_seeds:
                trial = sim_module.run_trial(tape, board, seed, facts)
                where = f"{tape_path.stem}:{board_id}:{seed}"
                yield where, [trace_line(item) for item in trial.wire], sent


def check(scenarios_dir: Path = DEFAULT_SCENARIOS, facts_path: Path = DEFAULT_FACTS) -> Report:
    report = Report()
    for where, lines, sent in live_wire(scenarios_dir, facts_path):
        check_lines(lines, where, report, sent)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate the live wire payloads against the "
        "anthropic types (A3.23: no golden files are read)."
    )
    parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS)
    parser.add_argument("--facts", type=Path, default=DEFAULT_FACTS)
    args = parser.parse_args(argv)
    report = check(args.scenarios, args.facts)
    for problem in report.problems:
        print(problem.render())
    if report.problems:
        print(f"check_wire: FAILED ({len(report.problems)} problems)")
        return 1
    print(f"check_wire: {report.payloads} payloads OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
