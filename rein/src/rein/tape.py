"""Tapes: load and check a scenario (ENGINE.md sections 5, 6 and A3.12, A3.13).

The schema (scenarios/schema.json) is checked by tools/check_scenarios.py. This module keeps the
rules the engine depends on, so a bad tape fails loudly instead of running differently: integer
and ASCII data (plain.py), the defaults of A3.12, and the reply-step rule of A3.13.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .plain import check_plain, loads_strict
from .spec import BUILTIN_TOOLS, CANONICAL_INDEX, EFFORT_LEVELS, ERROR_TYPES, NOTE_KINDS, TRIFECTA
from .vfs import is_outside, normalize

REPLY_STOPS = ("end_turn", "tool_use", "max_tokens", "refusal")
NON_REPLY_KEYS = ("error", "branch", "when", "repeat")


class TapeError(ValueError):
    """A tape the engine cannot run."""


@dataclass(frozen=True)
class Tape:
    id: str
    task: str
    model_id: str
    pricing: dict[str, Any]
    window: int
    system: str
    rules: list[str]
    workspace: dict[str, Any]
    outside: dict[str, Any]
    tools: list[str]
    custom_tools: list[dict[str, Any]]
    checks: list[dict[str, Any]]
    test_output: dict[str, str]
    script: list[dict[str, Any]]
    human: dict[str, Any]
    interrupt: dict[str, Any] | None
    boards: list[str]
    golden_seeds: list[int]
    seed_base: int
    faults: list[dict[str, Any]] = field(default_factory=list)
    outage: dict[str, Any] | None = None
    incident: dict[str, Any] | None = None  # A4: the incident block, shape-checked here
    notes: list[dict[str, Any]] = field(default_factory=list)  # A6.2: the commitments a run builds
    cache_rules: dict[str, int] | None = None  # A6.5: min_tokens and ttl_ms of the model
    effort: dict[str, Any] | None = None  # A7.3: default and thinking_tokens, when given
    tests: list[dict[str, Any]] = field(default_factory=list)  # A9.3: the test suite, when given
    canaries: list[str] = field(default_factory=list)  # A11.3: secrets the tape plants
    raw: dict[str, Any] = field(default_factory=dict)


def load_tape(path: Path) -> Tape:
    try:
        raw: Any = loads_strict(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise TapeError(f"{path}: {exc}") from exc
    return tape_from_dict(raw)


def tape_from_dict(raw: Any) -> Tape:
    if not isinstance(raw, dict):
        raise TapeError("tape must be a JSON object")
    try:
        check_plain(raw, "$")
        return _build(raw)
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise TapeError(f"tape {raw.get('id', '?')!r}: {exc}") from exc


def _build(raw: dict[str, Any]) -> Tape:
    if raw.get("schema") != 1:
        raise TapeError("schema must be 1")
    tools = [str(name) for name in raw["tools"]]
    for name in tools:
        if name not in BUILTIN_TOOLS:
            raise TapeError(f"unknown built-in tool {name!r}")
    custom = [dict(c) for c in raw["custom_tools"]]
    names = [str(c["name"]) for c in custom]
    if len(set(names)) != len(names) or set(names) & set(BUILTIN_TOOLS):
        raise TapeError("custom tool names must be unique and must not be built-in names")
    for entry in custom:
        if "latency_ms" in entry:
            _int(entry["latency_ms"], f"custom tool {entry['name']}.latency_ms", minimum=0)
        _check_provenance(entry)
    _check_roots(raw["workspace"], raw["outside"])
    window = _int(raw["window"], "window", minimum=1)
    # A3.12: the defaults for absent fields.
    seed_base = _int(raw.get("seed_base", 0), "seed_base", minimum=0)
    human = dict(raw.get("human", {"default": "deny"}))
    if human.get("default") not in ("approve", "deny"):
        raise TapeError("human.default must be approve or deny")
    interrupt_raw = raw.get("interrupt")
    interrupt = dict(interrupt_raw) if interrupt_raw is not None else None
    if interrupt is not None:
        _int(interrupt["turn"], "interrupt.turn", minimum=1)
    _check_steps(list(raw["script"]), "script")
    faults = [dict(f) for f in raw.get("faults", [])]
    for fault in faults:
        _int(fault["percent"], "faults.percent", minimum=0)
        if fault["type"] not in ERROR_TYPES:
            raise TapeError(f"unknown fault type {fault['type']!r}")
    outage_raw = raw.get("outage")
    outage = dict(outage_raw) if outage_raw is not None else None
    if outage is not None and outage["type"] not in ERROR_TYPES:
        raise TapeError(f"unknown outage type {outage['type']!r}")
    return Tape(
        id=str(raw["id"]),
        task=str(raw["task"]),
        model_id=str(raw["model_id"]),
        pricing=dict(raw["pricing"]),
        window=window,
        system=str(raw["system"]),
        rules=[str(r) for r in raw.get("rules", [])],
        workspace=dict(raw["workspace"]),
        outside=dict(raw["outside"]),
        tools=tools,
        custom_tools=custom,
        checks=[dict(c) for c in raw["checks"]],
        test_output={str(k): str(v) for k, v in raw["test_output"].items()},
        script=list(raw["script"]),
        human=human,
        interrupt=interrupt,
        boards=[str(b) for b in raw["boards"]],
        golden_seeds=[_int(s, "golden_seeds", minimum=0) for s in raw["golden_seeds"]],
        seed_base=seed_base,
        faults=faults,
        outage=outage,
        incident=_check_incident(raw.get("incident")),
        notes=_check_notes(raw.get("notes", [])),
        cache_rules=_check_cache_rules(raw.get("cache_rules")),
        effort=_check_effort(raw.get("effort")),
        tests=_check_tests(raw.get("tests", [])),
        canaries=_check_canaries(raw.get("canaries", [])),
        raw=raw,
    )


def _int(value: Any, where: str, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TapeError(f"{where} must be an integer")
    if value < minimum:
        raise TapeError(f"{where} must be at least {minimum}")
    return value


def _check_steps(steps: list[Any], where: str) -> None:
    for index, step in enumerate(steps):
        here = f"{where}[{index}]"
        if not isinstance(step, dict):
            raise TapeError(f"{here} must be an object")
        if "branch" in step:
            options = step["branch"]
            total = sum(_int(o["percent"], f"{here}.percent", 0) for o in options)
            if total != 100:
                raise TapeError(f"{here}: branch percents must sum to 100, got {total}")
            for option in options:
                _check_steps(list(option["then"]), f"{here}.then")
        elif "when" in step:
            for item in step["when"]:
                if "if" in item:
                    _check_condition(str(item["if"]), f"{here}.when")
                _check_steps(list(item.get("then", item.get("else", []))), f"{here}.when")
        elif "repeat" in step:
            body = step["repeat"]
            times = body["times"]
            if times != "forever":
                _int(times, f"{here}.repeat.times", minimum=1)
            _check_steps(list(body["steps"]), f"{here}.repeat")
        elif not any(key in step for key in NON_REPLY_KEYS):
            _check_reply(step, here)


def _check_reply(step: dict[str, Any], here: str) -> None:
    """A3.13: a reply's stop must agree with its tools."""
    tools = step.get("tools", [])
    if not isinstance(tools, list):
        raise TapeError(f"{here}.tools must be a list")
    for pair in tools:
        if not (isinstance(pair, list) and len(pair) == 2 and isinstance(pair[0], str)):
            raise TapeError(f"{here}.tools entries must be [name, input] pairs")
        if not isinstance(pair[1], dict):
            raise TapeError(f"{here}.tools input must be an object")
    stop = step.get("stop")
    if stop is not None and stop not in REPLY_STOPS:
        raise TapeError(f"{here}.stop must be one of {', '.join(REPLY_STOPS)}")
    if "latency_ms" in step:
        _int(step["latency_ms"], f"{here}.latency_ms", minimum=0)
    if stop == "tool_use" and not tools:
        raise TapeError(f"{here}: stop tool_use needs tools")
    if tools and stop is not None and stop != "tool_use":
        raise TapeError(f"{here}: a reply with tools must stop with tool_use, not {stop}")


def _check_roots(workspace: Any, outside: Any) -> None:
    """A3.13: a workspace key stays inside the root; an outside key does not; and no two keys
    (across both tables) share a normal form."""
    seen: dict[str, str] = {}
    for key in workspace:
        normal = normalize(str(key))
        if is_outside(normal):
            raise TapeError(f"workspace key {key!r} is not a relative path inside the root")
        _unique(seen, normal, key)
    for key in outside:
        normal = normalize(str(key))
        if not is_outside(normal):
            raise TapeError(f"outside key {key!r} is inside the root")
        _unique(seen, normal, key)


def _unique(seen: dict[str, str], normal: str, key: Any) -> None:
    if normal in seen:
        raise TapeError(f"keys {seen[normal]!r} and {key!r} have the same normal form {normal!r}")
    seen[normal] = str(key)


# A4: the incident block. Its shape is checked here; its references (family, board, seed, seqs)
# are checked by tools/check_scenarios.py against course.json and the golden trace.
INCIDENT_KEYS = frozenset(
    {
        "family",
        "wire",
        "board",
        "seed",
        "first_bad_seq",
        "accept_seqs",
        "why",
        "hint",
        "notes",
        "fixes",
        "correct_fix",
        "par_s",
    }
)
INCIDENT_REQUIRED = frozenset(
    {
        "family",
        "wire",
        "board",
        "seed",
        "first_bad_seq",
        "why",
        "hint",
        "fixes",
        "correct_fix",
        "par_s",
    }
)


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value:
        raise TapeError(f"{where} must be a non-empty string")
    return value


def _check_incident(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TapeError("incident must be an object")
    extra = set(raw) - INCIDENT_KEYS
    if extra:
        raise TapeError(f"incident has unknown keys {sorted(extra)}")
    missing = INCIDENT_REQUIRED - set(raw)
    if missing:
        raise TapeError(f"incident is missing keys {sorted(missing)}")
    _text(raw["family"], "incident.family")
    _text(raw["wire"], "incident.wire")
    _text(raw["board"], "incident.board")
    _int(raw["seed"], "incident.seed", minimum=0)
    _int(raw["first_bad_seq"], "incident.first_bad_seq", minimum=0)
    for seq in raw.get("accept_seqs", []):
        _int(seq, "incident.accept_seqs", minimum=0)
    _text(raw["why"], "incident.why")
    _text(raw["hint"], "incident.hint")
    for index, note in enumerate(raw.get("notes", [])):
        if not isinstance(note, dict) or set(note) != {"seq", "text"}:
            raise TapeError(f"incident.notes[{index}] must have exactly seq and text")
        _int(note["seq"], f"incident.notes[{index}].seq", minimum=0)
        _text(note["text"], f"incident.notes[{index}].text")
    fixes = raw["fixes"]
    if not isinstance(fixes, list) or not 2 <= len(fixes) <= 4:
        raise TapeError("incident.fixes must be a list of 2 to 4 fixes")
    for index, fix in enumerate(fixes):
        if not isinstance(fix, dict) or set(fix) != {"text", "why"}:
            raise TapeError(f"incident.fixes[{index}] must have exactly text and why")
        _text(fix["text"], f"incident.fixes[{index}].text")
        _text(fix["why"], f"incident.fixes[{index}].why")
    _int(raw["correct_fix"], "incident.correct_fix", minimum=0)
    _int(raw["par_s"], "incident.par_s", minimum=0)
    return dict(raw)


def _check_condition(condition: str, where: str) -> None:
    """The arguments of the A6 and A7 conditions, refused at load (A6.7)."""
    argument = condition.split(":", 1)[1] if ":" in condition else ""
    if condition.startswith("context_gte:") and not CANONICAL_INDEX.fullmatch(argument):
        raise TapeError(f"{where}: context_gte needs a canonical integer, got {condition!r}")
    if condition.startswith("sent_lacks:") and argument == "":
        raise TapeError(f"{where}: sent_lacks needs text after the colon")
    if condition.startswith("tools_gte:") and not CANONICAL_INDEX.fullmatch(argument):
        raise TapeError(f"{where}: tools_gte needs a canonical integer, got {condition!r}")
    if condition.startswith("tool_loaded:") and argument == "":
        raise TapeError(f"{where}: tool_loaded needs a tool name")
    if condition.startswith("last_result_contains:") and argument == "":  # A11.1
        raise TapeError(f"{where}: last_result_contains needs text after the colon")
    if condition.startswith("effort_gte:") and argument not in EFFORT_LEVELS:
        raise TapeError(f"{where}: effort_gte needs one of {', '.join(EFFORT_LEVELS)}")


def _check_provenance(entry: dict[str, Any]) -> None:
    """A11.4: a custom tool's server and version go together; trifecta holds distinct labels."""
    name = entry["name"]
    if ("server" in entry) != ("version" in entry):
        raise TapeError(f"custom tool {name}: server and version go together (A11.4)")
    if "server" in entry:
        _text(entry["server"], f"custom tool {name}.server")
        _text(entry["version"], f"custom tool {name}.version")
    if "trifecta" in entry:
        labels = entry["trifecta"]
        if not isinstance(labels, list) or len(set(map(str, labels))) != len(labels):
            raise TapeError(f"custom tool {name}.trifecta must be a list of distinct labels")
        for label in labels:
            if label not in TRIFECTA:
                raise TapeError(f"custom tool {name}.trifecta: {label!r} is not one of {TRIFECTA}")


def _check_canaries(raw: Any) -> list[str]:
    """A11.3: the canaries are non-empty and distinct."""
    if not isinstance(raw, list):
        raise TapeError("canaries must be a list")
    values = [_text(item, "canaries entry") for item in raw]
    if len(set(values)) != len(values):
        raise TapeError("canaries must be distinct")
    return values


def _check_notes(raw: Any) -> list[dict[str, Any]]:
    """A6.2: the notes, with unique ids and known kinds."""
    if not isinstance(raw, list):
        raise TapeError("notes must be a list")
    seen: set[str] = set()
    notes: list[dict[str, Any]] = []
    for index, note in enumerate(raw):
        where = f"notes[{index}]"
        if not isinstance(note, dict) or set(note) != {"id", "kind", "turn", "text"}:
            raise TapeError(f"{where} must have exactly id, kind, turn and text")
        note_id = _text(note["id"], f"{where}.id")
        if note_id in seen:
            raise TapeError(f"{where}: duplicate id {note_id!r}")
        seen.add(note_id)
        if note["kind"] not in NOTE_KINDS:
            raise TapeError(f"{where}: unknown kind {note['kind']!r}")
        _int(note["turn"], f"{where}.turn", minimum=0)
        _text(note["text"], f"{where}.text")
        notes.append(dict(note))
    return notes


def _check_cache_rules(raw: Any) -> dict[str, int] | None:
    """A6.5: the API's rules for the model: the minimum cacheable size and the lifetime."""
    if raw is None:
        return None
    if not isinstance(raw, dict) or set(raw) != {"min_tokens", "ttl_ms"}:
        raise TapeError("cache_rules must have exactly min_tokens and ttl_ms")
    return {
        "min_tokens": _int(raw["min_tokens"], "cache_rules.min_tokens", minimum=0),
        "ttl_ms": _int(raw["ttl_ms"], "cache_rules.ttl_ms", minimum=0),
    }


def _check_effort(raw: Any) -> dict[str, Any] | None:
    """A7.3 and A8.3: the tape's effort block (default level, optional, and thinking tokens)."""
    if raw is None:
        return None
    if not isinstance(raw, dict) or set(raw) - {"default", "thinking_tokens"}:
        raise TapeError("effort takes only default and thinking_tokens")
    effort: dict[str, Any] = {}
    if "default" in raw:
        if raw["default"] not in EFFORT_LEVELS:
            raise TapeError(f"effort.default must be one of {', '.join(EFFORT_LEVELS)}")
        effort["default"] = raw["default"]
    if "thinking_tokens" in raw:
        table = raw["thinking_tokens"]
        if not isinstance(table, dict) or set(table) - set(EFFORT_LEVELS):
            raise TapeError("effort.thinking_tokens may list only the five levels")
        # A8.3: any of the levels; a level left out adds 0.
        effort["thinking_tokens"] = {
            level: _int(table[level], f"effort.thinking_tokens.{level}", minimum=0)
            for level in EFFORT_LEVELS
            if level in table
        }
    return effort


def _check_tests(raw: Any) -> list[dict[str, Any]]:
    """A9.3: the tests as files say them: a marker (active while its file holds the text)."""
    if not isinstance(raw, list):
        raise TapeError("tests must be a list")
    seen: set[str] = set()
    tests: list[dict[str, Any]] = []
    for index, test in enumerate(raw):
        where = f"tests[{index}]"
        if not isinstance(test, dict) or set(test) != {"id", "marker", "check"}:
            raise TapeError(f"{where} must have exactly id, marker and check")
        test_id = _text(test["id"], f"{where}.id")
        if test_id in seen:
            raise TapeError(f"{where}: duplicate id {test_id!r}")
        seen.add(test_id)
        marker = test["marker"]
        if not isinstance(marker, dict) or set(marker) != {"file", "contains"}:
            raise TapeError(f"{where}.marker must have exactly file and contains")
        _text(marker["file"], f"{where}.marker.file")
        _text(marker["contains"], f"{where}.marker.contains")
        check = test["check"]
        if not isinstance(check, dict) or set(check) not in (
            {"file", "contains"},
            {"file", "not_contains"},
        ):
            raise TapeError(
                f"{where}.check must have file and exactly one of contains, not_contains"
            )
        _text(check["file"], f"{where}.check.file")
        for key in ("contains", "not_contains"):
            if key in check:
                _text(check[key], f"{where}.check.{key}")
        tests.append(dict(test))
    return tests
