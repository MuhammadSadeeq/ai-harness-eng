"""Amendment A3, item by item (docs/ENGINE.md "Amendments"). One group of tests per ruling that is
not already covered in the unit test files. Numbers in the test names are the ruling numbers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from support import BOARDS, FACTS_PATH, SCENARIOS, kinds, make_board, make_tape, of_kind, run

from rein.board import BoardError, board_from_dict
from rein.model import ScriptError
from rein.sim import load_facts, main, run_trial
from rein.tape import TapeError, load_tape, tape_from_dict
from rein.tools import Toolbox

FACTS = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
LIST = {"say": "again", "tools": [["list_files", {}]]}


# A3.1: tool definitions in tooldefs order, then custom tools in tape order.
def test_a3_1_definitions_follow_tooldefs_order_then_custom_in_tape_order() -> None:
    custom = [
        {
            "name": "zeta",
            "description": "z",
            "input_schema": {"type": "object"},
            "results": [],
            "latency_ms": 1,
        },
        {
            "name": "alpha",
            "description": "a",
            "input_schema": {"type": "object"},
            "results": [],
            "latency_ms": 1,
        },
    ]
    tape = make_tape(tools=["run_command", "read_file"], custom_tools=custom)
    names = [d["name"] for d in Toolbox(tape).definitions()]
    assert names == ["read_file", "run_command", "zeta", "alpha"]


# A3.2: unknown tool error and latency are covered in test_vfs_tools; the harness clock uses them.
def test_a3_2_the_clock_advances_by_the_unknown_tool_latency() -> None:
    result = run(
        make_tape(
            tools=["read_file"],
            script=[
                {"say": "x", "tools": [["list_files", {}]]},
                {"say": "done", "stop": "end_turn"},
            ],
        )
    )
    call = of_kind(result, "tool_call")[0]
    assert (call["ok"], call["output"]) == (False, "Unknown tool: list_files")
    permission = of_kind(result, "permission")[0]
    assert call["t"] - permission["t"] == 100


# A3.3: run_command words; the harness passes them through unchanged.
def test_a3_3_cat_with_two_arguments_is_a_usage_error_in_a_run() -> None:
    script = [{"say": "x", "tools": [["run_command", {"cmd": "cat a b"}]]}, {"say": "done"}]
    result = run(make_tape(script=script))
    assert of_kind(result, "tool_call")[0]["output"] == "usage: cat <path>"
    assert of_kind(result, "tool_call")[0]["ok"] is False


# A3.4: root writes are a directory error, and nothing is written.
def test_a3_4_writing_the_root_writes_nothing() -> None:
    script = [
        {"say": "x", "tools": [["write_file", {"path": ".", "content": "x"}]]},
        {"say": "done"},
    ]
    result = run(make_tape(script=script))
    call = of_kind(result, "tool_call")[0]
    assert (call["ok"], call["output"]) == (False, "Is a directory: .")


# A3.5: a check on a missing file fails.
def test_a3_5_a_check_on_a_missing_file_fails_the_gate() -> None:
    result = run(
        make_tape(checks=[{"file": "gone.txt", "not_contains": "x"}]),
        {"verify_gate": {"max_feedback": 0}},
    )
    assert of_kind(result, "verify")[0]["passed"] is False


# A3.6: an absolute path reads outside, and is never inside the workspace.
def test_a3_6_an_absolute_path_reads_the_planted_file_outside() -> None:
    tape = make_tape(
        outside={"/etc/passwd": "root"},
        script=[{"say": "x", "tools": [["read_file", {"path": "/etc/passwd"}]]}, {"say": "done"}],
    )
    result = run(tape, {"sandbox": {"egress": []}})
    assert of_kind(result, "sandbox")[0]["allowed"] is False
    assert of_kind(result, "sandbox")[0]["reason"] == "path outside the workspace: /etc/passwd"
    assert of_kind(run(tape), "tool_call")[0]["output"] == "root"


# A3.7: links without the sandbox; more than 8 hops is an error.
def test_a3_7_a_relative_link_is_followed_without_the_sandbox() -> None:
    tape = make_tape(
        workspace={"dir/a.txt": "one", "dir/link": {"link": "a.txt"}},
        script=[{"say": "x", "tools": [["read_file", {"path": "dir/link"}]]}, {"say": "done"}],
    )
    assert of_kind(run(tape), "tool_call")[0]["output"] == "one"


# A3.8: the sandbox event fires only for calls that reach the check (after the permission).
def test_a3_8_a_denied_call_never_reaches_the_sandbox() -> None:
    tape = make_tape(
        script=[{"say": "x", "tools": [["read_file", {"path": "a.txt"}]]}, {"say": "done"}]
    )
    result = run(tape, {"permissions": {"mode": "deny"}, "sandbox": {"egress": []}})
    assert of_kind(result, "permission")[0]["final"] == "deny"
    assert of_kind(result, "sandbox") == []


def test_a3_8_a_permitted_call_gets_a_sandbox_event_with_an_empty_allowed_reason() -> None:
    tape = make_tape(script=[{"say": "x", "tools": [["list_files", {}]]}, {"say": "done"}])
    event = of_kind(run(tape, {"sandbox": {"egress": []}}), "sandbox")[0]
    assert (event["allowed"], event["reason"]) == (True, "")


# A3.9: a human denial of an ask is a Denied result that names the rule.
def test_a3_9_a_human_denial_is_a_denied_result_with_the_rule_reason() -> None:
    tape = make_tape(
        human={"default": "deny"},
        script=[{"say": "x", "tools": [["list_files", {}]]}, {"say": "done"}],
    )
    result = run(
        tape,
        {
            "permissions": {
                "mode": "ask",
                "rules": [{"decision": "ask", "tool": "list_files", "reason": "may I?"}],
            }
        },
    )
    perm = of_kind(result, "permission")[0]
    assert (perm["rule"], perm["human"], perm["final"]) == ("rules[0]", "deny", "deny")
    assert result.wire[2]["messages"][-1]["content"][0]["content"] == "Denied: may I?"


# A3.10: globs are matched by pyjson for non-string values (also covered in test_policy).
def test_a3_10_a_numeric_input_matches_a_glob_by_its_pyjson() -> None:
    tape = make_tape(
        script=[
            {"say": "x", "tools": [["write_file", {"path": "f", "content": 1}]]},
            {"say": "done"},
        ]
    )
    result = run(
        tape,
        {
            "permissions": {
                "mode": "ask",
                "rules": [
                    {
                        "decision": "allow",
                        "tool": "write_file",
                        "match": {"content": "1"},
                        "reason": "one",
                    }
                ],
            }
        },
    )
    assert of_kind(result, "permission")[0]["final"] == "allow"


# A3.11: custom tool results (covered in test_vfs_tools); the run gets the output.
def test_a3_11_a_custom_tool_result_reaches_the_run() -> None:
    custom = {
        "name": "lookup",
        "description": "L",
        "input_schema": {"type": "object"},
        "latency_ms": 9,
        "results": [{"match": {"key": 1}, "output": "one"}],
        "default": {"output": "none"},
    }
    tape = make_tape(
        custom_tools=[custom],
        script=[{"say": "x", "tools": [["lookup", {"key": 1}]]}, {"say": "done"}],
    )
    result = run(tape)
    call = of_kind(result, "tool_call")[0]
    permission = of_kind(result, "permission")[0]
    assert (call["output"], call["ok"], call["t"] - permission["t"]) == ("one", True, 9)


# A3.12: tape defaults.
def test_a3_12_absent_human_means_deny() -> None:
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    for key in ("human", "seed_base", "faults", "outage", "interrupt", "rules"):
        raw.pop(key, None)
    tape = tape_from_dict(raw)
    assert tape.human == {"default": "deny"}
    assert (tape.seed_base, tape.faults, tape.outage, tape.interrupt, tape.rules) == (
        0,
        [],
        None,
        None,
        [],
    )


# A3.13: the loader rules.
@pytest.mark.parametrize(
    ("step", "message"),
    [
        ({"tools": [], "stop": "tool_use"}, "stop tool_use needs tools"),
        (
            {"say": "x", "tools": [["list_files", {}]], "stop": "end_turn"},
            "must stop with tool_use",
        ),
        ({"say": "x", "stop": "stop"}, "stop must be one of"),
    ],
)
def test_a3_13_a_stop_that_disagrees_with_its_tools_is_rejected(
    step: dict[str, Any], message: str
) -> None:
    with pytest.raises(TapeError, match=message):
        make_tape(script=[step])


def test_a3_13_tools_without_a_stop_key_mean_tool_use() -> None:
    result = run(make_tape(script=[{"say": "x", "tools": [["list_files", {}]]}, {"say": "d"}]))
    assert of_kind(result, "model_reply")[0]["stop_reason"] == "tool_use"


def test_a3_13_a_canonical_integer_key_is_rejected_but_a_negative_one_is_not() -> None:
    with pytest.raises(TapeError, match="numeric-string"):
        tape_from_dict({**json.loads((SCENARIOS / "b2-spiral.json").read_text()), "12": 1})
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["workspace"]["-3"] = "fine"
    tape_from_dict(raw)  # "-3" is not a canonical non-negative integer


def test_a3_13_workspace_and_outside_roots_are_checked() -> None:
    with pytest.raises(TapeError, match="workspace key"):
        make_tape(workspace={"/x": "a"})
    with pytest.raises(TapeError, match="outside key"):
        make_tape(outside={"a": "b"})


# A3.14: error steps, the invalid_request message, and the failure timing.
def test_a3_14_error_steps_default_to_300_ms_and_no_retry_after() -> None:
    error = of_kind(run(make_tape(script=[{"error": "timeout"}])), "model_error")[0]
    assert (error["retry_after_ms"], error["message"]) == (0, "Request timed out")
    result = run(make_tape(script=[{"error": "timeout"}]))
    assert result.events[-2]["t"] == 300


def test_a3_14_a_scripted_invalid_request_says_invalid_request() -> None:
    error = of_kind(run(make_tape(script=[{"error": "invalid_request"}])), "model_error")[0]
    assert error["message"] == "Invalid request"


def test_a3_14_faults_are_drawn_in_order_and_stop_at_the_first_failure() -> None:
    tape = make_tape(
        faults=[{"percent": 100, "type": "overloaded"}, {"percent": 100, "type": "rate_limit"}]
    )
    error = of_kind(run(tape), "model_error")[0]
    assert error["type"] == "overloaded"


def test_a3_14_an_outage_carries_its_retry_after_and_a_fault_carries_none() -> None:
    outage = make_tape(
        outage={"from_ms": 0, "to_ms": 999, "type": "rate_limit", "retry_after_ms": 40}
    )
    assert of_kind(run(outage), "model_error")[0]["retry_after_ms"] == 40
    fault = make_tape(faults=[{"percent": 100, "type": "rate_limit"}])
    assert of_kind(run(fault), "model_error")[0]["retry_after_ms"] == 0


def test_a3_14_a_text_block_exists_only_when_say_is_present() -> None:
    result = run(make_tape(script=[{"tools": [["list_files", {}]]}, {"say": "d"}]))
    first = result.wire[0]
    assert "messages" in first
    reply = result.wire[1]["content"]
    assert [block["type"] for block in reply] == ["tool_use"]


def test_a3_14_assistant_blocks_are_the_message_content() -> None:
    result = run(make_tape(script=[LIST, {"say": "d", "stop": "end_turn"}]))
    assistant = result.wire[2]["messages"][1]
    assert assistant["role"] == "assistant"
    assert [block["type"] for block in assistant["content"]] == ["text", "tool_use"]


# A3.15: conditions.
def test_a3_15_turn_gte_compares_the_1_based_turn() -> None:
    script = [
        {"when": [{"if": "turn_gte:1", "then": [{"say": "first"}]}, {"else": [{"say": "other"}]}]}
    ]
    assert of_kind(run(make_tape(script=script)), "model_reply")[0]["text"] == "first"


def test_a3_15_last_denied_reads_the_last_final_decision() -> None:
    script = [
        {"say": "x", "tools": [["list_files", {}]]},
        {"when": [{"if": "last_denied", "then": [{"say": "denied"}]}, {"else": [{"say": "ok"}]}]},
    ]
    result = run(make_tape(script=script), {"permissions": {"mode": "deny"}})
    assert of_kind(result, "model_reply")[-1]["text"] == "denied"


def test_a3_15_last_truncated_reads_the_last_tool_call() -> None:
    script = [
        {"say": "x", "tools": [["list_files", {}]]},
        {
            "when": [
                {"if": "last_truncated", "then": [{"say": "cut"}]},
                {"else": [{"say": "whole"}]},
            ]
        },
    ]
    result = run(
        make_tape(workspace={"a.txt": "y" * 400}, script=script), {"output_cap": {"max_tokens": 10}}
    )
    assert of_kind(result, "model_reply")[-1]["text"] == "whole"  # list_files output is short


# A3.16: a permanent error for a missing tool result, before outage and faults.
def test_a3_16_missing_results_are_a_permanent_error_with_no_breaker_or_retry() -> None:
    tape = make_tape(interrupt={"turn": 1, "resume": True}, script=[LIST, {"say": "d"}])
    result = run(
        tape,
        {
            "breaker": {"threshold": 1},
            "retry": {"max_attempts": 3, "base_ms": 1, "cap_ms": 1, "jitter": "none"},
        },
    )
    error = of_kind(result, "model_error")[0]
    assert (error["type"], error["attempt"], error["retry_after_ms"]) == ("invalid_request", 1, 0)
    assert error["message"] == (
        "tool_use ids were found without tool_result blocks immediately after"
    )
    assert of_kind(result, "breaker") == [] and of_kind(result, "retry_wait") == []
    assert result.status == "error"
    assert len(result.wire) == 2  # the second call wrote no wire payload


def test_a3_16_the_permanent_path_emits_model_call_then_300_ms_then_the_error() -> None:
    tape = make_tape(interrupt={"turn": 1, "resume": True}, script=[LIST, {"say": "d"}])
    result = run(tape)
    assert kinds(result)[-4:] == ["model_call", "model_error", "trace_write", "run_end"]
    call = of_kind(result, "model_call")[-1]
    error = of_kind(result, "model_error")[-1]
    assert call["attempt"] == 1 and error["attempt"] == 1
    assert error["t"] == call["t"] + 300


# A3.17: the resumed interrupt ends its turn with trace_write, then the next turn's guards.
def test_a3_17_resumed_interrupt_ends_the_turn_with_trace_write() -> None:
    tape = make_tape(interrupt={"turn": 1, "resume": True}, script=[LIST, {"say": "d"}])
    result = run(tape, {"close_books": {}})
    names = [e["kind"] for e in result.events]
    interrupt_index = names.index("interrupt")
    assert names[interrupt_index + 1] == "trace_write"
    assert result.status == "done"
    assert of_kind(result, "tool_call") == []  # the pending calls never ran


# A3.18: the output cap rule.
def test_a3_18_output_is_not_cut_when_the_length_is_at_most_four_times_the_limit() -> None:
    from rein.harness import Harness  # noqa: PLC0415
    from rein.pricing import Prices  # noqa: PLC0415

    harness_obj = Harness(
        make_tape(), make_board({"output_cap": {"max_tokens": 10}}), 1, Prices(0, 0)
    )
    text = '"' * 30  # tokens > 10 by pyjson (escaped quotes), but length 30 <= 40
    assert harness_obj._cap(text) == (text, False)  # noqa: SLF001
    long_text = "x" * 100
    shown, truncated = harness_obj._cap(long_text)  # noqa: SLF001
    assert truncated is True and "60 characters cut" in shown


# A3.19: --facts defaults to site/data/facts.json relative to the working directory.
def test_a3_19_default_facts_are_read_from_the_working_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    assert load_facts(None) is None  # no site/data/facts.json here: fine for inline pricing
    (tmp_path / "site" / "data").mkdir(parents=True)
    (tmp_path / "site" / "data" / "facts.json").write_text(json.dumps(FACTS), encoding="utf-8")
    assert load_facts(None) == FACTS


def test_a3_19_an_explicit_missing_facts_file_is_an_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.chdir(tmp_path)
    code = main(
        [
            "run",
            "--tape",
            str(SCENARIOS / "b2-spiral.json"),
            "--board",
            str(BOARDS / "b2-old.json"),
            "--seed",
            "1",
            "--facts",
            "nope.json",
        ]
    )
    assert code == 2
    assert "nope.json" in capsys.readouterr().err


# A3.20: redaction covers payload strings only; the envelope and the wire are untouched.
def test_a3_20_redaction_covers_payload_strings_but_not_the_envelope_or_the_wire() -> None:
    tape = make_tape(script=[LIST, {"say": "d"}])
    result = run(tape, {"redact": {"patterns": ["list"]}})
    # The tool name is a payload string, so it is redacted; the envelope kind is not.
    assert of_kind(result, "tool_call")[0]["tool"] == "[REDACTED]_files"
    assert result.events[0]["kind"] == "run_start"
    assert result.events[0]["run"] == "t-test:b:1"
    # The wire is never redacted: the model sees the real tool name.
    assert result.wire[1]["content"][1]["name"] == "list_files"


# A3.21: every line ends with a newline; zero lines print zero bytes.
def test_a3_21_wire_with_no_reply_prints_zero_bytes(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    tape_path = tmp_path / "t.json"
    raw = json.loads((SCENARIOS / "b2-spiral.json").read_text(encoding="utf-8"))
    raw["outage"] = {"from_ms": 0, "to_ms": 10**9, "type": "rate_limit"}
    tape_path.write_text(json.dumps(raw), encoding="utf-8")
    code = main(
        [
            "run",
            "--tape",
            str(tape_path),
            "--board",
            str(BOARDS / "b2-old.json"),
            "--seed",
            "1",
            "--wire",
            "--facts",
            str(FACTS_PATH),
        ]
    )
    assert code == 0
    assert capsys.readouterr().out == ""


def test_a3_21_each_printed_line_ends_with_a_newline(capsys: pytest.CaptureFixture[str]) -> None:
    main(
        [
            "run",
            "--tape",
            str(SCENARIOS / "b2-spiral.json"),
            "--board",
            str(BOARDS / "b2-new.json"),
            "--seed",
            "1",
            "--facts",
            str(FACTS_PATH),
        ]
    )
    out = capsys.readouterr().out
    assert out.endswith("\n") and out.count("\n") == 100


# A3.22: branch choices, recorded by location; the location of a repeated branch is shared.
def test_a3_22_choices_are_recorded_in_order_with_their_locations() -> None:
    calls = [["list_files", {}]]
    script = [
        {"branch": [{"percent": 100, "then": [LIST]}]},
        {
            "repeat": {
                "steps": [
                    {
                        "branch": [
                            {"percent": 50, "then": [{"say": "a", "tools": calls}]},
                            {"percent": 50, "then": [{"say": "b", "tools": calls}]},
                        ]
                    }
                ],
                "times": 2,
            }
        },
        {"say": "done", "stop": "end_turn"},
    ]
    trial = run_trial(make_tape(script=script), make_board(), 1, None)
    choices = trial.result.choices
    assert choices[0] == ("/script/0", 0)
    assert [loc for loc, _ in choices[1:]] == ["/script/1/repeat/steps/0"] * 2


def test_a3_22_choices_are_not_events() -> None:
    script = [{"branch": [{"percent": 100, "then": [{"say": "x", "stop": "end_turn"}]}]}]
    trial = run_trial(make_tape(script=script), make_board(), 1, None)
    assert all(e["kind"] != "branch" for e in trial.events)
    assert trial.result.choices == [("/script/0", 0)]


def test_a3_22_a_branch_nested_in_an_option_has_its_option_location() -> None:
    script = [
        {
            "branch": [
                {
                    "percent": 100,
                    "then": [
                        {
                            "branch": [
                                {"percent": 100, "then": [{"say": "deep", "stop": "end_turn"}]}
                            ]
                        }
                    ],
                }
            ]
        }
    ]
    trial = run_trial(make_tape(script=script), make_board(), 1, None)
    assert trial.result.choices == [("/script/0", 0), ("/script/0/branch/0/then/0", 0)]


def test_a3_22_a_script_that_cannot_reply_raises_a_script_error() -> None:
    script = [
        {"repeat": {"steps": [{"branch": [{"percent": 100, "then": []}]}], "times": "forever"}}
    ]
    with pytest.raises(ScriptError):
        run(make_tape(script=script))


def test_a3_22_branch_locations_resolve_in_the_original_script() -> None:
    from support import load_facts as _facts  # noqa: PLC0415

    tape = load_tape(SCENARIOS / "b2-spiral.json")
    trial = run_trial(tape, make_board(), 1, _facts())
    assert trial.result.choices == [("/script/3", 1)]
    assert tape.raw["script"][3]["branch"][1]["percent"] == 40


def test_a3_22_board_rules_need_a_reason() -> None:
    with pytest.raises(BoardError, match="reason"):
        board_from_dict(
            {
                "id": "b",
                "label": "B",
                "modules": {
                    "permissions": {
                        "mode": "ask",
                        "rules": [{"decision": "allow", "tool": "read_file", "reason": ""}],
                    }
                },
            }
        )


# A3.8 (BP-1.3 round 2): the board loader rejects an egress entry that is not lowercase.
def test_a3_8_an_uppercase_egress_entry_is_rejected() -> None:
    from rein.board import BoardError as _BoardError  # noqa: PLC0415

    with pytest.raises(_BoardError, match="must be lowercase"):
        board_from_dict(
            {"id": "b", "label": "B", "modules": {"sandbox": {"egress": ["Api.Example"]}}}
        )


def test_a3_8_a_lowercase_egress_list_loads() -> None:
    board = board_from_dict(
        {"id": "b", "label": "B", "modules": {"sandbox": {"egress": ["api.example.com"]}}}
    )
    assert board.param("sandbox", "egress") == ["api.example.com"]
