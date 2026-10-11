"""The run (ENGINE.md section 7.1 and amendments A1, A2), exercised through small tapes."""

from __future__ import annotations

from typing import Any

import pytest
from support import BOARDS, SCENARIOS, kinds, load_facts, make_tape, of_kind, run

from rein.board import load_board
from rein.model import ScriptError
from rein.sim import run_bench, run_trial
from rein.tape import load_tape

FACTS = load_facts()


def dev_tape() -> Any:
    return load_tape(SCENARIOS / "b2-spiral.json")


def dev_board(name: str) -> Any:
    return load_board(BOARDS / f"{name}.json")


def forever(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"repeat": {"steps": steps, "times": "forever"}}]


LIST = {"say": "again", "tools": [["list_files", {}]]}
RETRY = {"max_attempts": 3, "base_ms": 100, "cap_ms": 300, "jitter": "none"}


# ---- the dev tape: the B2 incident, both boards ----------------------------------------------


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_new_board_never_runs_past_twelve_turns(seed: int) -> None:
    result = run_trial(dev_tape(), dev_board("b2-new"), seed, FACTS).result
    assert result.turns <= 12
    assert result.status == "max_turns"


def test_seeds_one_to_five_take_the_spiral_branch_on_both_boards() -> None:
    # The first draw of seeds 1 to 5 is at least 60, so the 40 percent spiral branch is taken.
    for seed in range(1, 6):
        old = run_trial(dev_tape(), dev_board("b2-old"), seed, FACTS).result
        new = run_trial(dev_tape(), dev_board("b2-new"), seed, FACTS).result
        assert (old.status, old.turns) == ("interrupted", 60)
        assert (new.status, new.turns) == ("max_turns", 12)
        assert old.passed is False and new.passed is False


def test_bench_pass_counts_match_on_both_boards() -> None:
    old = run_bench(dev_tape(), dev_board("b2-old"), 20, FACTS)
    new = run_bench(dev_tape(), dev_board("b2-new"), 20, FACTS)
    assert old["passed"] == new["passed"]
    assert max(t["turns"] for t in new["trials"]) <= 12


def test_the_success_branch_passes_on_seed_zero() -> None:
    # seed 0's first draw is 38 (< 60): the model removes the stray "+ 1" and the tests pass.
    result = run_trial(dev_tape(), dev_board("b2-old"), 0, FACTS).result
    assert result.status == "done"
    assert result.passed is True


def test_same_seed_gives_identical_output() -> None:
    first = run_trial(dev_tape(), dev_board("b2-old"), 3, FACTS)
    second = run_trial(dev_tape(), dev_board("b2-old"), 3, FACTS)
    assert first.events == second.events
    assert first.wire == second.wire
    # The seed matters: seed 0 takes the success branch (done in six turns) and seed 3 does not
    # (it is interrupted at 60 turns), so a seed that is ignored would make them equal.
    other = run_trial(dev_tape(), dev_board("b2-old"), 0, FACTS)
    assert (other.result.status, other.result.turns) != (first.result.status, first.result.turns)


def test_each_turn_emits_the_per_turn_events() -> None:
    result = run_trial(dev_tape(), dev_board("b2-new"), 1, FACTS).result
    for kind in ("prompt_built", "context_check", "model_call", "model_reply", "trace_write"):
        assert len(of_kind(result, kind)) >= result.turns
    assert len(of_kind(result, "recovery_check")) == result.turns


# ---- envelope, sequence and wire ----------------------------------------------------------------


def test_envelope_and_sequence() -> None:
    result = run(make_tape())
    assert [e["seq"] for e in result.events] == list(range(len(result.events)))
    assert all(e["v"] == 1 and e["agent"] == "main" for e in result.events)
    assert result.events[0]["kind"] == "run_start"
    assert result.events[-1]["kind"] == "run_end"
    assert result.events[0]["run"] == "t-test:b:1"


def test_run_end_fields_and_cost_arithmetic() -> None:
    result = run(make_tape())
    end = of_kind(result, "run_end")[0]
    assert end["status"] == "done" and end["passed"] is True and end["turns"] == 1
    assert end["tokens"] == {"input": result.tokens_in, "output": result.tokens_out}
    reply = of_kind(result, "model_reply")[0]
    prompt = of_kind(result, "prompt_built")[0]["tokens"]
    assert reply["cost"] == prompt * 1000 + reply["usage"]["output_tokens"] * 2000
    assert end["cost"] == reply["cost"]


def test_wire_has_one_request_and_one_response_per_call() -> None:
    result = run(make_tape())
    assert len(result.wire) == 2
    request, response = result.wire
    assert "messages" in request and request["max_tokens"] == 4096
    assert request["model"] == "claude-test-1"
    assert response["id"] == "msg_1" and response["stop_reason"] == "end_turn"
    assert response["usage"]["input_tokens"] == of_kind(result, "prompt_built")[0]["tokens"]


# ---- script steps --------------------------------------------------------------------------------


def test_script_runs_out_with_a_fixed_reply() -> None:
    result = run(make_tape(script=[]))
    assert of_kind(result, "model_reply")[0]["text"] == "(the script has run out)"
    assert result.status == "done"


def test_tool_turns_run_tools_and_send_results_in_one_message() -> None:
    script = [
        {"say": "reading", "tools": [["read_file", {"path": "a.txt"}], ["list_files", {}]]},
        {"say": "done"},
    ]
    result = run(make_tape(script=script))
    calls = of_kind(result, "tool_call")
    assert [c["tool"] for c in calls] == ["read_file", "list_files"]
    assert [c["tool_use_id"] for c in calls] == ["toolu_1_1", "toolu_1_2"]
    assert calls[0]["ok"] is True and calls[0]["output"] == "hello\n"
    # run_start, prompt_built, context_check, model_call, recovery_check, model_reply,
    # then permission and tool_call for each of the two calls: ten events before the write.
    assert of_kind(result, "trace_write")[0]["events"] == 10
    second_request = result.wire[2]
    assert second_request["messages"][-1]["role"] == "user"
    assert len(second_request["messages"][-1]["content"]) == 2


def test_error_step_fails_the_call_and_is_consumed() -> None:
    script = [{"error": "overloaded", "retry_after_ms": 0}, {"say": "fine", "stop": "end_turn"}]
    result = run(make_tape(script=script))
    error = of_kind(result, "model_error")[0]
    assert (error["type"], error["message"], error["attempt"]) == ("overloaded", "Overloaded", 1)
    assert result.status == "error"  # no retry module: the run ends on the first failure


def test_branch_steps_choose_by_draw() -> None:
    script = [{"branch": [{"percent": 100, "then": [LIST]}]}, {"say": "after", "stop": "end_turn"}]
    result = run(make_tape(script=script))
    assert [r["text"] for r in of_kind(result, "model_reply")] == ["again", "after"]


def test_when_steps_choose_by_turn_state() -> None:
    late = [
        {"when": [{"if": "turn_gte:2", "then": [{"say": "late"}]}, {"else": [{"say": "early"}]}]}
    ]
    result = run(make_tape(script=[LIST, *late, {"say": "end", "stop": "end_turn"}]))
    assert [r["text"] for r in of_kind(result, "model_reply")] == ["again", "late"]
    early = [
        {"when": [{"if": "turn_gte:9", "then": [{"say": "late"}]}, {"else": [{"say": "early"}]}]}
    ]
    result = run(make_tape(script=[LIST, *early]))
    assert [r["text"] for r in of_kind(result, "model_reply")] == ["again", "early"]


def test_repeat_forever_without_a_reply_is_reported_not_looped() -> None:
    script = forever([{"branch": [{"percent": 100, "then": []}]}])
    with pytest.raises(ScriptError):
        run(make_tape(script=script))


def test_repeat_times_splices_the_steps() -> None:
    script = [{"repeat": {"steps": [LIST], "times": 2}}]
    assert len(of_kind(run(make_tape(script=script)), "tool_call")) == 2


# ---- faults, outages, retries and the breaker ---------------------------------------------------


def test_outage_fails_calls_until_the_window_ends() -> None:
    tape = make_tape(
        outage={"from_ms": 0, "to_ms": 10_000, "type": "overloaded", "retry_after_ms": 0}
    )
    result = run(tape, {"retry": RETRY})
    errors = of_kind(result, "model_error")
    assert [e["type"] for e in errors] == ["overloaded"] * 3  # RETRY allows three attempts
    assert [e["attempt"] for e in errors] == [1, 2, 3]
    assert [w["wait_ms"] for w in of_kind(result, "retry_wait")] == [100, 200]
    assert result.status == "error"


def test_retry_backoff_without_jitter_doubles_and_caps() -> None:
    script = [{"error": "timeout", "error_ms": 300}] * 3 + [{"say": "ok", "stop": "end_turn"}]
    result = run(make_tape(script=script), {"retry": {**RETRY, "max_attempts": 4}})
    assert [w["wait_ms"] for w in of_kind(result, "retry_wait")] == [100, 200, 300]
    assert result.status == "done"


def test_retry_after_is_a_floor_on_the_wait() -> None:
    script = [{"error": "rate_limit", "retry_after_ms": 2000}, {"say": "ok", "stop": "end_turn"}]
    result = run(make_tape(script=script), {"retry": RETRY})
    assert [w["wait_ms"] for w in of_kind(result, "retry_wait")] == [2000]


def test_jitter_draws_below_base_plus_one() -> None:
    script = [{"error": "api_error"}, {"say": "ok", "stop": "end_turn"}]
    jitter = {**RETRY, "jitter": "full"}
    result = run(make_tape(script=script), {"retry": jitter}, seed=5)
    assert 0 <= of_kind(result, "retry_wait")[0]["wait_ms"] <= 100


def test_invalid_request_is_never_retried() -> None:
    script = [{"error": "invalid_request"}, {"say": "ok", "stop": "end_turn"}]
    result = run(make_tape(script=script), {"retry": RETRY})
    assert of_kind(result, "retry_wait") == []
    assert result.status == "error"


def test_breaker_opens_on_consecutive_failures() -> None:
    script = [{"error": "overloaded"}, {"error": "overloaded"}, {"say": "ok"}]
    result = run(make_tape(script=script), {"retry": RETRY, "breaker": {"threshold": 2}})
    assert result.status == "circuit_open"
    breaker = of_kind(result, "breaker")[0]
    assert (breaker["state"], breaker["failures"]) == ("open", 2)


def test_recovery_check_reports_the_breaker_state() -> None:
    assert (
        of_kind(run(make_tape(), {"breaker": {"threshold": 3}}), "recovery_check")[0]["breaker"]
        == "closed"
    )
    assert of_kind(run(make_tape()), "recovery_check")[0]["breaker"] == "none"


# ---- amendment A1: overflow -------------------------------------------------------------------


def test_overflow_ends_the_run_without_a_call() -> None:
    result = run(make_tape(window=50))
    assert of_kind(result, "context_check")[0]["action"] == "overflow"
    assert kinds(result)[-3:] == ["model_error", "trace_write", "run_end"]
    error = of_kind(result, "model_error")[0]
    assert error["type"] == "invalid_request" and error["attempt"] == 1
    assert error["retry_after_ms"] == 0
    assert error["message"].startswith("prompt is too long: ")
    assert error["message"].endswith(" tokens > 50 maximum")
    assert of_kind(result, "run_end")[0]["status"] == "error"
    assert result.wire == []  # no request was sent
    assert of_kind(result, "model_error")[0]["t"] == 300  # the only time that advanced


def test_overflow_ignores_faults_and_retries() -> None:
    tape = make_tape(window=50, faults=[{"percent": 100, "type": "overloaded"}])
    result = run(tape, {"retry": RETRY})
    assert of_kind(result, "model_error")[0]["type"] == "invalid_request"
    assert of_kind(result, "retry_wait") == []


# ---- amendment A2 and interrupts ----------------------------------------------------------------


def test_fatigued_approver_draws_only_after_the_threshold() -> None:
    tape = make_tape(
        human={"default": "deny", "fatigue": {"after": 1, "approve_percent": 100}},
        script=[
            {
                "say": "a",
                "tools": [["edit_file", {"path": "a.txt", "old_text": "h", "new_text": "H"}]],
            },
            {
                "say": "b",
                "tools": [["edit_file", {"path": "a.txt", "old_text": "e", "new_text": "E"}]],
            },
            {"say": "c", "stop": "end_turn"},
        ],
    )
    result = run(tape, {"permissions": {"mode": "ask"}})
    perms = of_kind(result, "permission")
    assert [p["human"] for p in perms] == ["deny", "approve"]
    assert [p["final"] for p in perms] == ["deny", "allow"]


def test_deny_if_refuses_matching_calls_with_the_tool_error() -> None:
    tape = make_tape(
        human={"default": "approve", "deny_if": {"path": "*.lock"}},
        script=[{"say": "x", "tools": [["read_file", {"path": "p.lock"}]]}, {"say": "done"}],
    )
    result = run(tape, {"permissions": {"mode": "ask"}})
    assert of_kind(result, "permission")[0]["human"] == "deny"
    assert of_kind(result, "permission")[0]["final"] == "deny"
    assert of_kind(result, "tool_call") == []
    blocks = result.wire[2]["messages"][-1]["content"]
    assert blocks[0]["content"] == "Denied: no rule matched (mode ask)"
    assert blocks[0]["is_error"] is True


def test_deny_by_policy_is_an_error_result() -> None:
    tape = make_tape(
        script=[{"say": "x", "tools": [["read_file", {"path": "a.txt"}]]}, {"say": "done"}]
    )
    result = run(tape, {"permissions": {"mode": "deny"}})
    perm = of_kind(result, "permission")[0]
    assert (perm["decision"], perm["rule"], perm["human"]) == ("deny", "default", None)
    assert of_kind(result, "tool_call") == []
    blocks = result.wire[2]["messages"][-1]["content"]
    assert blocks[0]["content"] == "Denied: no rule matched (mode deny)"


def test_interrupt_without_resume_ends_the_run() -> None:
    tape = make_tape(interrupt={"turn": 1}, script=[LIST, {"say": "done"}])
    result = run(tape)
    interrupt = of_kind(result, "interrupt")[0]
    assert (interrupt["by"], interrupt["pending"]) == ("human", ["toolu_1_1"])
    assert result.status == "interrupted"
    assert of_kind(result, "tool_call") == []


def test_close_books_and_resume_continue_the_run() -> None:
    tape = make_tape(
        interrupt={"turn": 1, "resume": True}, script=[LIST, {"say": "done", "stop": "end_turn"}]
    )
    result = run(tape, {"close_books": {}})
    assert result.status == "done"
    assert of_kind(result, "tool_call") == []
    assert of_kind(result, "model_error") == []
    closed = result.wire[2]["messages"][-1]["content"][0]
    assert closed["content"] == "Interrupted by the user before this ran."
    assert closed["is_error"] is True


def test_resume_without_close_books_fails_the_next_call() -> None:
    tape = make_tape(interrupt={"turn": 1, "resume": True}, script=[LIST, {"say": "done"}])
    result = run(tape)
    error = of_kind(result, "model_error")[0]
    assert error["type"] == "invalid_request"
    assert (
        error["message"] == "tool_use ids were found without tool_result blocks immediately after"
    )
    assert result.status == "error"


# ---- verify gate ---------------------------------------------------------------------------------


def test_verify_gate_passes_then_done() -> None:
    result = run(make_tape(), {"verify_gate": {"max_feedback": 1}})
    assert of_kind(result, "verify")[0]["passed"] is True
    assert result.status == "done" and result.passed is True


def test_verify_gate_feeds_back_then_marks_unverified() -> None:
    tape = make_tape(
        checks=[{"file": "a.txt", "contains": "bye"}],
        script=[{"say": "claim one"}, {"say": "claim two"}, {"say": "claim three"}],
    )
    result = run(tape, {"verify_gate": {"max_feedback": 1}})
    verdicts = of_kind(result, "verify")
    assert [v["passed"] for v in verdicts] == [False, False]
    assert verdicts[0]["output"] == "1 failed"
    assert result.status == "unverified"
    assert result.passed is False
    feedback = result.wire[2]["messages"][-1]["content"][0]["text"]  # the second request
    assert feedback == "Verification failed: 1 failed Fix it, then say done."


def test_false_done_is_visible_without_the_gate() -> None:
    result = run(make_tape(checks=[{"file": "a.txt", "contains": "bye"}]))
    assert result.status == "done" and result.passed is False


# ---- guards ----


def test_turn_limit_stops_before_the_next_turn() -> None:
    result = run(make_tape(script=forever([LIST])), {"turn_limit": {"max_turns": 3}})
    assert (result.status, result.turns) == ("max_turns", 3)
    assert of_kind(result, "guard")[0]["guard"] == "max_turns"


def test_loop_detect_fires_on_identical_calls() -> None:
    result = run(make_tape(script=forever([LIST])), {"loop_detect": {"window": 3}})
    assert result.status == "loop"
    guard = of_kind(result, "guard")[0]
    assert (guard["guard"], guard["limit"], guard["value"]) == ("loop", 3, 3)


def test_token_budget_stops_when_spent() -> None:
    big = {"say": "x" * 200, "tools": [["list_files", {}]]}
    result = run(make_tape(script=forever([big])), {"token_budget": {"max_tokens": 500}})
    assert result.status == "budget"


def test_safety_stop_at_turn_sixty_is_an_operator_interrupt() -> None:
    result = run(make_tape(script=forever([LIST])))
    assert (result.status, result.turns) == ("interrupted", 60)
    assert of_kind(result, "interrupt")[-1]["by"] == "operator"


# ---- sandbox, custom tools, redaction ----


def test_sandbox_blocks_traversal_and_link_escape() -> None:
    tape = make_tape(
        workspace={"a.txt": "hello\n", "link.txt": {"link": "../secrets.env"}},
        outside={"../secrets.env": "KEY=1"},
        script=[
            {
                "say": "x",
                "tools": [
                    ["read_file", {"path": "../secrets.env"}],
                    ["read_file", {"path": "link.txt"}],
                ],
            },
            {"say": "done"},
        ],
    )
    result = run(tape, {"sandbox": {"egress": []}})
    sandbox = of_kind(result, "sandbox")
    assert [s["allowed"] for s in sandbox] == [False, False]
    assert sandbox[0]["reason"] == "path outside the workspace: ../secrets.env"
    assert of_kind(result, "tool_call") == []
    assert result.wire[2]["messages"][-1]["content"][0]["content"].startswith(
        "Blocked by the sandbox: "
    )


def test_without_sandbox_the_escape_reads_outside() -> None:
    tape = make_tape(
        outside={"../secrets.env": "KEY=1"},
        script=[
            {"say": "x", "tools": [["read_file", {"path": "../secrets.env"}]]},
            {"say": "done"},
        ],
    )
    assert of_kind(run(tape), "tool_call")[0]["output"] == "KEY=1"


def test_network_custom_tool_needs_its_host_in_egress() -> None:
    custom = {
        "name": "fetch",
        "description": "Fetch a URL",
        "input_schema": {"type": "object"},
        "latency_ms": 5,
        "effect": "network",
        "results": [],
        "default": {"output": "ok", "ok": True},
    }
    tape = make_tape(
        custom_tools=[custom],
        script=[
            {"say": "x", "tools": [["fetch", {"url": "https://evil.test/a"}]]},
            {"say": "done"},
        ],
    )
    blocked = run(tape, {"sandbox": {"egress": ["api.example.com"]}})
    assert of_kind(blocked, "sandbox")[0]["reason"] == "host not in egress: evil.test"
    assert of_kind(blocked, "tool_call") == []
    allowed = run(tape, {"sandbox": {"egress": ["evil.test"]}})
    assert of_kind(allowed, "tool_call")[0]["output"] == "ok"


def test_redaction_counts_replacements_in_events_only() -> None:
    tape = make_tape(
        workspace={"a.txt": "token=SECRET and SECRET\n"},
        script=[{"say": "x", "tools": [["read_file", {"path": "a.txt"}]]}, {"say": "done"}],
    )
    result = run(tape, {"redact": {"patterns": ["SECRET"]}})
    assert of_kind(result, "tool_call")[0]["output"] == "token=[REDACTED] and [REDACTED]\n"
    assert sum(t["redacted"] for t in of_kind(result, "trace_write")) == 2
    # The wire is not redacted: the model still receives the real text.
    assert "SECRET" in result.wire[2]["messages"][-1]["content"][0]["content"]


def test_custom_tool_default_is_used_when_no_result_matches() -> None:
    custom = {
        "name": "lookup",
        "description": "Lookup",
        "input_schema": {"type": "object"},
        "latency_ms": 7,
        "results": [{"match": {"key": "a"}, "output": "found", "ok": True}],
        "default": {"output": "missing", "ok": False},
    }
    tape = make_tape(
        custom_tools=[custom],
        script=[{"say": "x", "tools": [["lookup", {"key": "z"}]]}, {"say": "done"}],
    )
    call = of_kind(run(tape), "tool_call")[0]
    assert (call["output"], call["ok"], call["tool"]) == ("missing", False, "lookup")
