"""The engine tapes (ENGINE.md A8.6): each shows its amendment's features, on every seed."""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any

import pytest
from support import FACTS_PATH, of_kind

from rein.board import board_from_dict, load_board
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
    # the whole-file write carries real newlines (the fixture once held a literal backslash-n)
    written = of_kind(old, "tool_call")[0]["input"]["content"]
    assert written == "def add(a, b):\n    return a\n"
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


# A14 (BP-3.6, ENGINE A14 and the A15 rulings): the sub-agents, sessions, crash, ledgers and
# models of the fixtures above.


def requests(result: Any) -> list[dict[str, Any]]:
    return [item for item in result.wire if "system" in item]


def test_a_sub_agent_names_its_events_and_the_parent_sees_its_start_and_end() -> None:
    result = trial("eng-subagents", "eng-subagents-isolated", 0)
    starts = of_kind(result, "subagent_start")
    assert [(e["name"], e["k"], e["context"]) for e in starts] == [
        ("reader", 1, "isolated"),
        ("stubborn", 2, "isolated"),
    ]
    ends = of_kind(result, "subagent_end")
    assert [(e["status"], e["turns"], e["agent"], e["turn"]) for e in ends] == [
        ("done", 2, "main", 1),
        ("max_turns", 2, "main", 2),
    ]
    assert {event["agent"] for event in result.events} == {"main", "reader#1", "stubborn#2"}
    assert any(e["kind"] == "trace_write" and e["agent"] == "reader#1" for e in result.events)


def test_the_refusals_and_the_limit_say_what_happened() -> None:
    isolated = trial("eng-subagents", "eng-subagents-isolated", 0)
    assert tool_results(isolated, "run_agent") == [
        ("The note says: Buy milk.", True),
        ("Sub-agent ended max_turns: Still reading again.", False),
        ("Unknown agent: ghost", False),
    ]
    limited = trial("eng-subagents", "eng-subagents-max", 0)
    assert tool_results(limited, "run_agent") == [
        ("The note says: Buy milk.", True),
        ("Sub-agent limit reached (1)", False),
        ("Unknown agent: ghost", False),
    ]
    assert ended(limited)["passed"] is True


def test_a_sub_agent_has_no_run_agent_or_layers_and_a_fork_joins_the_last_user_turn() -> None:
    result = trial("eng-subagents", "eng-subagents-forked", 0)
    prompts = [e for e in of_kind(result, "prompt_built") if e["agent"] != "main"]
    assert prompts and all(e["layers"] == ["system", "tools", "history"] for e in prompts)
    sub_requests = [
        item for item in requests(result) if "run_agent" not in [t["name"] for t in item["tools"]]
    ]
    replies = [e for e in result.events if e["kind"] == "model_reply" and e["agent"] != "main"]
    assert len(sub_requests) == len(replies) == 4
    reader_first, stubborn_first = sub_requests[0]["messages"], sub_requests[2]["messages"]
    assert len(reader_first) == 1 and reader_first[0]["role"] == "user"
    assert [b["text"] for b in reader_first[0]["content"]] == [
        "Ask a reader for the first note and a second agent for the other, then write summary.txt.",
        "Read notes/a.txt and return the note.",
    ]
    assert [m["role"] for m in stubborn_first] == ["user", "assistant", "user"]
    assert stubborn_first[-1]["content"][-1] == {"type": "text", "text": "Read notes/b.txt twice."}


def test_sessions_count_from_one_and_the_progress_note_comes_from_session_two() -> None:
    progress = trial("eng-sessions", "eng-sessions-progress", 0)
    assert [e["session"] for e in of_kind(progress, "session_start")] == [1, 2, 3]
    layers = {e["turn"]: e["layers"] for e in of_kind(progress, "prompt_built")}
    assert all("progress" not in layers[turn] for turn in (1, 2, 3))
    assert all("progress" in layers[turn] for turn in (4, 5, 6, 7))
    assert ended(progress)["turns"] == 7 and ended(progress)["status"] == "done"
    assert ended(progress)["passed"] is True
    plain = trial("eng-sessions", "eng-sessions-plain", 0)
    assert all("progress" not in e["layers"] for e in of_kind(plain, "prompt_built"))
    assert ended(plain)["passed"] is True


def test_a_crash_repeats_the_charge_unless_the_session_is_durable() -> None:
    plain = trial("eng-crash", "eng-crash-plain", 0)
    assert len(of_kind(plain, "crash")) == 1 and of_kind(plain, "resume") == []
    assert len(tool_results(plain, "charge")) == 2  # the restarted script charges again
    assert ended(plain)["passed"] is False and ended(plain)["turns"] == 5
    durable = trial("eng-crash", "eng-crash-durable", 0)
    assert of_kind(durable, "resume")[0]["from_turn"] == 3
    assert len(tool_results(durable, "charge")) == 1
    assert ended(durable)["passed"] is True and ended(durable)["turns"] == 3


def test_a_crash_after_the_last_turn_never_fires() -> None:
    tape = dataclasses.replace(load_tape(ENGINE / "eng-crash.json"), crash={"turn": 3})
    result = run_trial(tape, load_board(ENGINE_BOARDS / "eng-crash-durable.json"), 0, FACTS).result
    assert of_kind(result, "crash") == [] and of_kind(result, "resume") == []


def test_a_lost_reply_is_retried_and_a_key_keeps_the_payment_to_one() -> None:
    retried = trial("eng-idempotency", "eng-idem-retry", 0)
    assert [(e["attempt"], e["ok"], e["output"]) for e in of_kind(retried, "tool_call")] == [
        (1, False, "Timed out waiting for the reply; the action may have happened."),
        (2, True, "Paid."),
    ]
    assert ended(retried)["passed"] is False  # two payments, one ledger check of one line
    keyed = trial("eng-idempotency", "eng-idem-both", 0)
    # A16.1: the repeat returns the tool's own first output, Paid., with ok true, and is not retried
    assert [(e["attempt"], e["ok"], e["output"]) for e in of_kind(keyed, "tool_call")] == [
        (1, False, "Timed out waiting for the reply; the action may have happened."),
        (2, True, "Paid."),
    ]
    assert texts(keyed)[-1] == "Paid. Done."
    assert ended(keyed)["passed"] is True
    for result in (retried, keyed):  # a retry shows no permission, only a tool_call
        assert len([e for e in of_kind(result, "permission") if e["tool"] == "pay"]) == 1


def test_a_profile_rejects_the_param_until_the_capability_check_drops_it() -> None:
    rejected = trial("eng-models", "eng-models-reject", 0)
    errors = of_kind(rejected, "model_error")
    assert errors[0]["message"] == "temperature: this parameter is not supported on model-a"
    assert ended(rejected)["status"] == "error" and ended(rejected)["turns"] == 1
    dropped = trial("eng-models", "eng-models-dropped", 0)
    assert of_kind(dropped, "capability")[0]["dropped"] == ["temperature"]
    assert all("temperature" not in item for item in requests(dropped))
    assert ended(dropped)["passed"] is True
    other = trial("eng-models", "eng-models-b", 0)
    assert other and all(item["temperature"] == 1 for item in requests(other))
    assert ended(other)["passed"] is True


def board_with(base: str, **extra: Any) -> Any:
    """An engine board with extra modules added (the fixtures stay as they are)."""
    raw = json.loads((ENGINE_BOARDS / f"{base}.json").read_text(encoding="utf-8"))
    raw["modules"] = {**raw["modules"], **extra}
    return board_from_dict(raw)


def test_a_sub_agent_result_is_never_retried_even_when_it_starts_with_timed_out() -> None:
    # A16.6: tool_retry never retries a run_agent result, whatever its text says.
    tape = load_tape(ENGINE / "eng-subagents.json")
    tape = dataclasses.replace(
        tape,
        agents={"reader": {"script": [{"say": "Timed out, sorry.", "stop": "end_turn"}]}},
    )
    board = board_from_dict(
        {
            "id": "retry-agents",
            "modules": {
                "subagents": {"context": "isolated", "max": 5, "max_turns": 2},
                "tool_retry": {"max_attempts": 3},
            },
        }
    )
    result = run_trial(tape, board, 0, FACTS).result
    first = [e for e in of_kind(result, "tool_call") if e["tool"] == "run_agent"][0]
    assert first["output"] == "Timed out, sorry." and first["attempt"] == 1


def test_faults_and_outages_reach_a_sub_agents_model_calls() -> None:
    # A16.6: the tape's outage applies to every model call, the sub-agent's included.
    tape = dataclasses.replace(
        load_tape(ENGINE / "eng-subagents.json"),
        outage={"from_ms": 1700, "to_ms": 1800, "type": "overloaded"},
    )
    board = board_with("eng-subagents-isolated")
    result = run_trial(tape, board, 0, FACTS).result
    errors = [e for e in of_kind(result, "model_error") if e["agent"] == "reader#1"]
    assert [e["type"] for e in errors] == ["overloaded"]
    end = [e for e in of_kind(result, "subagent_end") if e["name"] == "reader"][0]
    assert end["status"] == "error"
    assert tool_results(result, "run_agent")[0] == ("Sub-agent ended error: ", False)


def test_the_run_start_events_come_in_the_ruled_order() -> None:
    # A16.6: run_start, the tool_rejected events, capability, then the first session_start.
    board = board_with("eng-sessions-plain", capability_check={})
    kinds = [
        e["kind"]
        for e in run_trial(load_tape(ENGINE / "eng-sessions.json"), board, 0, FACTS).result.events[
            :3
        ]
    ]
    assert kinds == ["run_start", "capability", "session_start"]
    pinned = board_with("eng-pins-pinned", capability_check={})
    head = run_trial(load_tape(ENGINE / "eng-pins.json"), pinned, 0, FACTS).result.events
    assert [e["kind"] for e in head[:5]] == [
        "run_start",
        "tool_rejected",
        "tool_rejected",
        "tool_rejected",
        "capability",
    ]


def test_sub_agent_ids_are_scoped_by_its_number_and_turn() -> None:
    # A16.3: toolu_a<k>_<turn>_<j> for tool uses, msg_a<k>_<turn> for replies, in wire order.
    result = trial("eng-subagents", "eng-subagents-isolated", 0)
    reader_reply = [e for e in of_kind(result, "model_reply") if e["agent"] == "reader#1"][0]
    assert reader_reply["tool_uses"][0]["id"] == "toolu_a1_1_1"
    stubborn_reply = [e for e in of_kind(result, "model_reply") if e["agent"] == "stubborn#2"][1]
    assert stubborn_reply["tool_uses"][0]["id"] == "toolu_a2_2_1"
    response_ids = [item["id"] for item in result.wire if item.get("role") == "assistant"]
    assert "msg_a1_1" in response_ids and "msg_a2_2" in response_ids
