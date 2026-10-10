"""The engine tapes (ENGINE.md A8.6): each shows its amendment's features, on every seed."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from support import FACTS_PATH, of_kind

from rein.board import load_board
from rein.sim import run_trial
from rein.spec import STATUSES
from rein.tape import load_tape

ENGINE = Path(__file__).resolve().parents[2] / "scenarios" / "engine"
ENGINE_BOARDS = ENGINE / "boards"
FACTS = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
TAPES = sorted(ENGINE.glob("*.json"))
CASES = [
    (tape_path, board_id, seed)
    for tape_path in TAPES
    for board_id in load_tape(tape_path).boards
    for seed in load_tape(tape_path).golden_seeds
]


def trial(tape_id: str, board_id: str, seed: int) -> Any:
    tape = load_tape(ENGINE / f"{tape_id}.json")
    return run_trial(tape, load_board(ENGINE_BOARDS / f"{board_id}.json"), seed, FACTS).result


def texts(result: Any) -> list[str]:
    return [str(event["text"]) for event in of_kind(result, "model_reply")]


@pytest.mark.parametrize(
    ("tape_path", "board_id", "seed"), CASES, ids=lambda v: getattr(v, "stem", str(v))
)
def test_every_engine_run_ends_with_a_known_status(
    tape_path: Path, board_id: str, seed: int
) -> None:
    result = trial(tape_path.stem, board_id, seed)
    assert result.status in STATUSES
    assert result.turns >= 1


def test_compaction_keeps_the_kinds_each_board_keeps() -> None:
    all_kinds = trial("eng-compaction", "eng-compaction-keep-all", 0)
    progress = trial("eng-compaction", "eng-compaction-keep-progress", 0)
    kept_all = {note for event in of_kind(all_kinds, "compaction") for note in event["kept_notes"]}
    kept_progress = {
        note for event in of_kind(progress, "compaction") for note in event["kept_notes"]
    }
    # n5 is written at turn 4, so the compaction at turn 5 is the first that knows it.
    assert kept_all == {"n1", "n2", "n3", "n4", "n5"}
    assert kept_progress == {"n2", "n5"}  # the progress notes only


def test_resend_off_makes_compaction_inert_and_sent_lacks_sees_it() -> None:
    result = trial("eng-compaction", "eng-compaction-resend-off", 0)
    assert of_kind(result, "compaction") == []
    assert "I have no summary yet." in texts(result)
    summarised = trial("eng-compaction", "eng-compaction-keep-all", 0)
    assert "I have a summary of the work so far." in texts(summarised)


def test_the_context_condition_reads_the_prompt_against_the_window() -> None:
    assert "The context is past 3 percent." in texts(
        trial("eng-compaction", "eng-compaction-keep-all", 0)
    )
    assert "The context is still small." in texts(
        trial("eng-compaction", "eng-compaction-resend-off", 0)
    )


def test_a_plain_cache_reads_and_the_clock_board_never_does() -> None:
    plain = [e for e in of_kind(trial("eng-cache-clock", "eng-cache-plain", 0), "cache")]
    clock = [e for e in of_kind(trial("eng-cache-clock", "eng-cache-clock", 0), "cache")]
    assert plain[0]["read"] == 0 and all(event["read"] > 0 for event in plain[1:])
    assert all(event["read"] == 0 for event in clock)


def test_an_expired_entry_is_not_read() -> None:
    cache = of_kind(trial("eng-cache-ttl", "eng-cache-ttl", 0), "cache")
    assert [event["read"] > 0 for event in cache] == [False, True, False, True]


def test_below_the_minimum_nothing_is_cached() -> None:
    cache = of_kind(trial("eng-cache-short", "eng-cache-short", 0), "cache")
    assert all(e["read"] == 0 and e["write"] == 0 and e["matched"] == "none" for e in cache)
    assert all(e["uncached"] > 0 and e["hit_percent"] == 0 for e in cache)


def test_compaction_breaks_the_prefix_so_the_compacted_call_reads_nothing() -> None:
    cache = of_kind(trial("eng-cache-compaction", "eng-cache-compaction", 0), "cache")
    compacted = [
        event
        for event in of_kind(
            trial("eng-cache-compaction", "eng-cache-compaction", 0), "context_check"
        )
        if event["action"] == "compacted"
    ]
    assert compacted
    assert (
        cache[2]["read"] == 0 and cache[2]["write"] > 0
    )  # the third call follows the first compaction


def test_each_input_reason_is_named_and_the_trusting_board_runs_everything() -> None:
    checked = of_kind(trial("eng-validate", "eng-validate-checked", 0), "input_check")
    assert [(e["valid"], e["reason"]) for e in checked] == [
        (False, "missing required field: id"),
        (False, "field id must be integer"),
        (False, "unknown field: zz"),
        (False, 'field mode must be one of: "fast", "slow"'),
        (True, ""),
    ]
    trusting = trial("eng-validate", "eng-validate-trusting", 0)
    assert of_kind(trusting, "input_check") == []
    assert len(of_kind(trusting, "tool_call")) == 5


def test_split_results_send_one_message_each_and_the_condition_sees_it() -> None:
    assert "The results came in separate messages." in texts(
        trial("eng-split", "eng-split-split", 0)
    )
    assert "The results came in one message." in texts(trial("eng-split", "eng-split-joined", 0))


def test_the_effort_levels_set_the_thinking_tokens() -> None:
    def thinking(board: str) -> list[int]:
        return [
            e["usage"]["output_tokens_details"]["thinking_tokens"]
            for e in of_kind(trial("eng-effort", board, 0), "model_reply")
        ]

    assert set(thinking("eng-effort-default")) == {5}  # the tape default, low
    assert set(thinking("eng-effort-low")) == {5}  # the board names low explicitly
    assert set(thinking("eng-effort-max")) == {50}  # the board's level
    assert set(thinking("eng-effort-high")) == {0}  # high is not in the partial table
    assert "High effort: I read the file." in texts(trial("eng-effort", "eng-effort-max", 0))
    assert "Lower effort: I read the notes." in texts(trial("eng-effort", "eng-effort-default", 0))


def ended(result: Any) -> dict[str, Any]:
    return of_kind(result, "run_end")[0]


def tool_results(result: Any, name: str) -> list[tuple[str, bool]]:
    return [
        (str(event["output"]), bool(event["ok"]))
        for event in of_kind(result, "tool_call")
        if event["tool"] == name
    ]


def verdicts(result: Any) -> list[tuple[str, bool]]:
    return [(str(event["check"]), bool(event["passed"])) for event in of_kind(result, "verify")]


def test_an_override_turns_the_misuse_off_through_sent_lacks() -> None:
    old = trial("eng-overrides", "eng-overrides-old", 0)
    new = trial("eng-overrides", "eng-overrides-new", 0)
    assert [event["tool"] for event in of_kind(old, "tool_call")] == ["write_file"]
    assert [event["tool"] for event in of_kind(new, "tool_call")] == ["edit_file"]
    assert ended(old)["passed"] is False and ended(old)["turns"] == 2
    assert ended(new)["passed"] is True and ended(new)["turns"] == 2


def test_tool_search_loads_on_demand_and_a_call_to_an_unloaded_tool_runs() -> None:
    on = trial("eng-search", "eng-search-on", 0)
    assert tool_results(on, "tool_search") == [
        ("Loaded: lint_file", True),
        ("No tool matched: bake cake", False),
    ]
    # never loaded, still runs: once after the no-match search, once in the tools_gte branch
    assert tool_results(on, "count_lines") == [("7 lines", True), ("7 lines", True)]
    assert {
        "lint_file is in the request.",
        "Fewer than four tools are in the request.",
        "count_lines was never sent.",
    } <= set(texts(on))
    assert ended(on)["passed"] is True and ended(on)["turns"] == 5


def test_without_the_module_tool_search_is_unknown_and_every_tool_is_sent() -> None:
    off = trial("eng-search", "eng-search-off", 0)
    assert tool_results(off, "tool_search") == [
        ("Unknown tool: tool_search", False),
        ("Unknown tool: tool_search", False),
    ]
    assert {
        "lint_file is in the request.",
        "Four or more tools are in the request.",
        "count_lines is in the request.",
    } <= set(texts(off))
    assert ended(off)["passed"] is True and ended(off)["turns"] == 5


def test_a_deleted_marker_fools_run_command_and_the_plain_gate_not_the_pristine_one() -> None:
    plain = trial("eng-tamper", "eng-tamper-plain", 0)
    pristine = trial("eng-tamper", "eng-tamper-pristine", 0)
    assert [output for output, _ in tool_results(plain, "run_command")] == [
        "1 failed: t-add",
        "1 passed",
    ]
    assert verdicts(plain) == [("tests", True)]
    assert ended(plain)["passed"] is False and ended(plain)["turns"] == 4
    assert [output for output, _ in tool_results(pristine, "run_command")] == [
        "1 failed: t-add",
        "1 passed",
        "1 passed",
    ]
    assert verdicts(pristine) == [("tests (pristine)", False), ("tests (pristine)", True)]
    assert ended(pristine)["passed"] is True and ended(pristine)["turns"] == 7


def test_cost_names_the_largest_part_with_ties_to_the_earliest_and_splits_the_cache() -> None:
    plain = of_kind(trial("eng-cost", "eng-cost-plain", 0), "cost")
    assert len(plain) == len(of_kind(trial("eng-cost", "eng-cost-plain", 0), "model_reply"))
    assert plain[0]["top_part"] == "system"  # system and messages[0] tie at 60 tokens
    assert plain[0]["top_tokens"] == 60
    for event in plain:
        assert event["cache_cost"] == 0
        assert event["call_cost"] == event["input_cost"] + event["output_cost"]

    cached = of_kind(trial("eng-cost", "eng-cost-cache", 0), "cost")
    assert cached[0]["cache_cost"] > 0  # the first call writes the prefix
    assert all(event["cache_cost"] > 0 for event in cached[1:])  # later calls read it
    for event in cached:
        assert (
            event["call_cost"] == event["input_cost"] + event["output_cost"] + event["cache_cost"]
        )


def test_the_edge_queries_say_what_happened() -> None:
    edges = trial("eng-search-edges", "eng-search-edges", 0)
    assert tool_results(edges, "tool_search") == [
        ("No tool matched: ", False),  # empty: nothing loads
        ("Loaded: lint_file", True),
        ("Already loaded: lint_file", True),
        ("Loaded: format_file, count_lines", True),  # the loaded read_file is skipped
        ("Already loaded: read_file", True),  # an always tool counts as loaded
        ("No tool matched:    ", False),  # blank: no words
    ]
    assert "Three definitions, tool_search counted." in texts(edges)  # tools_gte counts it
    assert ended(edges)["passed"] is True and ended(edges)["turns"] == 7


def test_a_top_part_tie_goes_to_the_earlier_part() -> None:
    tie = of_kind(trial("eng-cost-tie", "eng-cost-tie", 0), "cost")
    # the tools part and messages[0] are both 51 tokens; tools comes first
    assert [(event["top_part"], event["top_tokens"]) for event in tie] == [
        ("tools", 51),
        ("tools", 51),
    ]
    for event in tie:
        assert event["call_cost"] == (
            event["input_cost"] + event["output_cost"] + event["cache_cost"]
        )
