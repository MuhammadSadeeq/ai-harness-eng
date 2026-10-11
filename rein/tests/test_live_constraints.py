"""The live model (BP-4.2 §1, SPEC §7.4), run through the harness against the local mock of the
Messages API. Each constraint has a test and cites its fact id (facts/api.yaml, facts/models.yaml).
A claim with no fact yet is named in the report, not asserted here."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from live_mock import MockAnthropic, assert_loopback, load_exchange
from support import load_facts, make_board, make_tape

from rein.harness import Harness
from rein.live import (
    LIVE_PRICE_FACTS,
    LiveError,
    LiveModel,
    SpendCap,
    check_model,
    cost_nano,
    live_prices,
    make_client,
    redact,
)
from rein.model import LiveUsage
from rein.pricing import Prices, resolve_prices
from rein.spec import ERROR_MESSAGES, WIRE_MAX_TOKENS

FACTS = load_facts()
PRICES = resolve_prices({"fact": "models.sonnet-5-5-price"}, FACTS)
SECRET = "sk-ant-test-SECRET-7f3a9c"


def live_run(
    mock: MockAnthropic,
    modules: dict[str, Any] | None = None,
    cap: int = 10**12,
    key: str = "sk-ant-test-key",
    tape: Any = None,
    model_id: str = "claude-sonnet-5-5",
) -> tuple[Any, LiveModel]:
    client = make_client(key, mock.url)
    model = LiveModel(model_id=model_id, client=client, prices=PRICES, cap=SpendCap(limit=cap))
    board = make_board(modules)
    result = Harness(tape or make_tape(), board, 1, PRICES, live=model).run()
    return result, model


def kinds_of(result: Any, kind: str) -> list[dict[str, Any]]:
    return [event for event in result.events if event["kind"] == kind]


def test_the_mock_listens_on_loopback_only() -> None:
    with MockAnthropic(load_exchange("refusal")) as mock:
        assert_loopback(mock.url)


def test_a_tool_using_run_reaches_done_and_the_history_is_append_only() -> None:
    # Append-only history: a reply's blocks go back exactly as received, thinking blocks and
    # signatures included (SPEC §7.4). No fact yet for the thinking-block rule: reported.
    recorded = load_exchange("tool_then_done")
    with MockAnthropic(recorded) as mock:
        result, model = live_run(mock)
    assert result.status == "done"
    assert result.passed
    assert model.calls == 2
    bodies = mock.bodies()
    assert bodies[0]["model"] == "claude-sonnet-5-5"  # the live id reaches the request
    first_reply = recorded[0][1]["content"]
    second_assistant = [m for m in bodies[1]["messages"] if m["role"] == "assistant"][0]
    assert second_assistant["content"] == first_reply
    assert any(block["type"] == "thinking" for block in second_assistant["content"])
    # the wire holds each turn's request and response: two turns, four payloads
    assert len(result.wire) == 4
    assert result.tokens_in == 412 + 530 and result.tokens_out == 58 + 14  # the recorded usage


def test_no_forced_tool_choice_and_no_assistant_prefill_is_ever_sent() -> None:
    # Forced tool use is rejected on Claude Opus 5.5 and Claude Sonnet 5.5 with a 400 error
    # (api.tool-choice-adaptive-forced-exceptions); a prefilled last assistant turn is rejected by
    # Claude Sonnet 5.5 (api.prefill-claude-sonnet-5-5). So neither is sent.
    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        live_run(mock)
    for body in mock.bodies():
        assert "tool_choice" not in body
        assert body["messages"][-1]["role"] == "user"


def test_effort_is_set_only_through_the_boards_output_config() -> None:
    # Effort is set with output_config.effort on the request (api.effort-location).
    with MockAnthropic(load_exchange("refusal")) as mock:
        live_run(mock, modules={"effort": {"level": "medium"}})
    assert mock.bodies()[0]["output_config"] == {"effort": "medium"}
    with MockAnthropic(load_exchange("refusal")) as mock:
        live_run(mock)
    assert "output_config" not in mock.bodies()[0]


def test_parallel_tool_results_go_back_in_one_user_message() -> None:
    # One user message holds every tool_result of one assistant turn
    # (api.parallel-results-one-message).
    with MockAnthropic(load_exchange("parallel_tools")) as mock:
        result, _ = live_run(mock)
    assert result.status == "done"
    second = mock.bodies()[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "user"]
    results = [b for b in second[2]["content"] if b["type"] == "tool_result"]
    assert [b["tool_use_id"] for b in results] == ["toolu_par_01", "toolu_par_02"]


def test_a_refusal_ends_the_run_as_refused() -> None:
    # The refusal stop reason comes back on a normal 200 response (api.stop-reason-refusal).
    with MockAnthropic(load_exchange("refusal")) as mock:
        result, _ = live_run(mock)
    assert result.status == "refused"
    assert kinds_of(result, "run_end")[0]["status"] == "refused"


def test_an_overloaded_error_is_retried_by_the_harness_then_the_run_goes_on() -> None:
    # 529 is overloaded_error (api.error-529-overloaded). The SDK's own retries are off, so the
    # harness's retry module does the retrying, and the trace shows each attempt.
    modules = {"retry": {"max_attempts": 3, "base_ms": 1, "cap_ms": 1, "jitter": "none"}}
    with MockAnthropic(load_exchange("overloaded_then_done")) as mock:
        result, model = live_run(mock, modules=modules)
    assert result.status == "done"
    assert model.calls == 2
    errors = kinds_of(result, "model_error")
    assert errors[0]["type"] == "overloaded"
    assert kinds_of(result, "retry_wait")


def test_the_spend_cap_stops_the_run_before_any_request_is_sent() -> None:
    # The cap is checked against the worst case of the next request before it is sent.
    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        result, model = live_run(mock, cap=1)
    assert result.status == "budget"
    assert mock.bodies() == []
    assert model.calls == 0
    guards = kinds_of(result, "guard")
    assert guards and guards[0]["guard"] == "spend_cap"


def test_the_spend_cap_refuses_a_request_whose_output_could_pass_it() -> None:
    # The worst case of a request is its input bound plus its output bound (WIRE_MAX_TOKENS at the
    # output price). A cap between the two must refuse it before any request is sent.
    with MockAnthropic(load_exchange("tool_then_done")) as probe:
        measured, _ = live_run(probe)
    body = json.dumps(measured.wire[0], separators=(",", ":"), ensure_ascii=True)
    input_price = max(PRICES.input_milli, PRICES.cache_write_milli or 0)
    input_only = len(body.encode("utf-8")) * input_price
    full = input_only + WIRE_MAX_TOKENS * PRICES.output_milli
    cap = input_only + 1
    assert input_only < cap < full
    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        result, model = live_run(mock, cap=cap)
    assert result.status == "budget"
    assert mock.bodies() == []
    assert model.calls == 0


def test_cache_writes_and_reads_are_priced_in_the_run_cost_and_the_cap() -> None:
    # models.sonnet-5-5-price: cache writes at $2.50 per MTok, cache reads at $0.10, base input $2.
    # The run's cost and the cap must both price each kind of token at its own rate.
    assert PRICES.cache_write_milli is not None and PRICES.cache_read_milli is not None
    assert PRICES.cache_read_milli != PRICES.input_milli
    exchange: list[Any] = []
    for status, body, headers in load_exchange("tool_then_done"):
        if status == 200:
            usage = dict(
                body["usage"], cache_creation_input_tokens=1000, cache_read_input_tokens=5000
            )
            body = dict(body, usage=usage)
        exchange.append((status, body, headers))
    replies = [body["usage"] for status, body, _ in exchange if status == 200]
    expected = sum(
        u["input_tokens"] * PRICES.input_milli
        + u["cache_creation_input_tokens"] * PRICES.cache_write_milli
        + u["cache_read_input_tokens"] * PRICES.cache_read_milli
        + u["output_tokens"] * PRICES.output_milli
        for u in replies
    )
    with MockAnthropic(exchange) as mock:
        result, model = live_run(mock)
    assert model.calls == len(replies)
    assert result.cost == expected
    assert model.cap.spent == expected


def test_the_spend_the_cap_counts_is_the_run_cost() -> None:
    # Cost comes from the API's usage and the dated prices (models.sonnet-5-5-price).
    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        result, model = live_run(mock)
    assert result.cost == model.cap.spent
    assert result.cost > 0


def test_an_html_200_is_a_live_error_not_a_crash() -> None:
    # A proxy or captive portal answers 200 with a page: the SDK returns text, not a Message.
    with (
        MockAnthropic([(200, "<html><body>portal</body></html>", {})]) as mock,
        pytest.raises(LiveError) as caught,
    ):
        live_run(mock)
    assert "something other than a Messages API reply" in str(caught.value)


def test_a_200_message_without_usage_is_a_live_error_not_a_crash() -> None:
    first_status, body, headers = load_exchange("tool_then_done")[0]
    assert first_status == 200
    no_usage = {key: value for key, value in body.items() if key != "usage"}
    with MockAnthropic([(200, no_usage, headers)]) as mock, pytest.raises(LiveError) as caught:
        live_run(mock)
    assert "something other than a Messages API reply" in str(caught.value)


def test_a_bad_request_is_a_model_error_with_the_fixed_message() -> None:
    # 400 is invalid_request_error (api.error-400-invalid-request); the trace records a fixed
    # message, never the response text.
    with MockAnthropic(load_exchange("bad_request")) as mock:
        result, _ = live_run(mock)
    assert result.status == "error"
    error = kinds_of(result, "model_error")[0]
    assert error["type"] == "invalid_request"
    assert error["message"] == ERROR_MESSAGES["invalid_request"]
    assert "malformed" not in json.dumps(result.events)


def test_an_unauthorized_key_stops_with_a_message_that_names_the_variable() -> None:
    # 401 is authentication_error (api.error-401-authentication): no retry can help.
    with MockAnthropic(load_exchange("unauthorized")) as mock, pytest.raises(LiveError) as caught:
        live_run(mock, key=SECRET)
    assert "ANTHROPIC_API_KEY" in str(caught.value)
    assert SECRET not in str(caught.value)


def test_the_key_never_reaches_a_trace_even_when_the_server_echoes_it() -> None:
    # A server that writes the key into its error text must not get it into the trace.
    echoing = [
        (
            400,
            {"type": "error", "error": {"type": "invalid_request_error", "message": "key {key}"}},
            {},
        )
    ]
    with MockAnthropic(echoing, echo_key=True) as mock:
        result, _ = live_run(mock, key=SECRET)
    assert SECRET not in json.dumps(result.events)
    assert SECRET not in json.dumps(result.wire)


def test_redaction_replaces_the_key_in_any_error_text() -> None:
    assert redact(f"a {SECRET} b", SECRET) == "a [REDACTED] b"
    assert redact(f"a {SECRET} b {SECRET}", SECRET) == "a [REDACTED] b [REDACTED]"
    assert redact("no key here", None) == "no key here"


def test_the_model_id_is_checked_against_the_models_api_before_the_run() -> None:
    with MockAnthropic([]) as mock:
        client = make_client("sk-ant-test-key", mock.url)
        check_model(client, "claude-sonnet-5-5")
        assert mock.requests[-1].path == "/v1/models/claude-sonnet-5-5"
        with pytest.raises(LiveError) as caught:
            check_model(client, "claude-unknown-9")
    assert "claude-unknown-9" in str(caught.value)
    assert "not listed by the Models API" in str(caught.value)


def test_the_sdk_retries_are_off_because_the_harness_retries() -> None:
    # The SDK retries transient failures twice by default (api.error-sdk-retries). Off here.
    assert make_client("sk-ant-test-key", "http://127.0.0.1:9").max_retries == 0


def test_a_prompt_over_the_haiku_ceiling_is_refused_before_it_is_sent() -> None:
    # The Haiku price applies up to 100,000 prompt tokens (models.haiku-5-5-price-up-to-100k).
    with MockAnthropic(load_exchange("refusal")) as mock:
        client = make_client("sk-ant-test-key", mock.url)
        model = LiveModel(
            model_id="claude-haiku-5-5",
            client=client,
            prices=PRICES,
            cap=SpendCap(limit=10**12),
            max_prompt_tokens=10,
        )
        with pytest.raises(LiveError) as caught:
            Harness(make_tape(), make_board({}), 1, PRICES, live=model).run()
    assert "may pass 10 tokens" in str(caught.value)
    assert mock.bodies() == []


def test_every_live_model_has_a_price_fact_that_exists() -> None:
    for model_id, fact_id in LIVE_PRICE_FACTS.items():
        assert fact_id in FACTS, f"{model_id} is priced by {fact_id}, which is not in the registry"
        prices, _ = live_prices(model_id, FACTS)
        assert prices.input_milli > 0


def test_the_loader_reads_the_haiku_ceiling_from_its_fact() -> None:
    prices, ceiling = live_prices("claude-haiku-5-5", FACTS)
    assert ceiling == 100000
    assert prices.input_milli == 100  # $0.10 per MTok, in milli-units


def test_the_cost_of_a_reply_is_its_usage_times_the_price_per_token() -> None:
    # The harness's cost formula on the API's counts: 100 input tokens at $2 per MTok and 10
    # output tokens at $10 per MTok, in nano-units (1 USD = 1e9).
    usage = LiveUsage(input_tokens=100, output_tokens=10)
    assert cost_nano(usage, PRICES) == 100 * 2000 + 10 * 10000


def test_the_prices_of_the_two_profiles_come_from_the_registry() -> None:
    prices: Prices = resolve_prices({"fact": "models.opus-5-5-price"}, FACTS)
    assert prices.input_milli == 4000
    assert prices.output_milli == 20000


def test_every_live_wire_payload_validates_against_the_sdk_types() -> None:
    # The requests the live model sends and the responses it gets are the same payloads check_wire
    # validates for the scripted runs: the SDK's own types (decision D-019).
    import sys

    from rein.pyjson import trace_line

    tools = str(Path(__file__).resolve().parents[2] / "tools")
    if tools not in sys.path:
        sys.path.insert(0, tools)
    import check_wire

    with MockAnthropic(load_exchange("tool_then_done")) as mock:
        result, _ = live_run(mock)
    assert len(result.wire) == 4
    problems: list[str] = []
    for index, item in enumerate(result.wire):
        problems += check_wire.payload_problems(trace_line(item), f"live[{index}]")
    assert problems == []
