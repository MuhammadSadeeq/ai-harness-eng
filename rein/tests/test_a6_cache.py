"""ENGINE.md A6.5: the cache model: prefixes, the map, read and write, cost, wire marks."""

from __future__ import annotations

from typing import Any

import pytest
from support import load_facts, make_tape, of_kind, run

from rein.board import BoardError
from rein.harness import Harness
from rein.pricing import resolve_prices
from rein.spec import MODULES
from rein.tape import TapeError

FACTS = load_facts()
PRICES = {
    "input_milli_per_mtok": 1000,
    "output_milli_per_mtok": 2000,
    "cache_write_milli_per_mtok": 1250,
    "cache_read_milli_per_mtok": 100,
}
RULES = {"min_tokens": 1, "ttl_ms": 1_000_000}
TWO = [{"tools": [["list_files", {}]]}, {"tools": [["list_files", {}]]}, {"say": "done"}]
CACHE = {"cache": {}}


def cached_tape(**changes: Any) -> Any:
    data: dict[str, Any] = {"pricing": PRICES, "cache_rules": RULES, "script": TWO}
    data.update(changes)
    return make_tape(**data)


def test_the_module_is_known_to_the_board() -> None:
    assert "cache" in MODULES


def test_the_second_call_reads_the_prefix_the_first_call_wrote() -> None:
    cache = of_kind(run(cached_tape(), CACHE), "cache")
    assert cache[0]["read"] == 0
    assert cache[0]["write"] > 0 and cache[0]["uncached"] == 0
    assert cache[1]["read"] > 0
    assert cache[1]["matched"] == "messages[0]"
    assert cache[1]["uncached"] == 0


def test_a_prompt_below_the_minimum_is_not_cached() -> None:
    tape = cached_tape(cache_rules={"min_tokens": 10**9, "ttl_ms": 1_000_000})
    cache = of_kind(run(tape, CACHE), "cache")
    assert all(event["read"] == 0 and event["write"] == 0 for event in cache)
    assert all(event["matched"] == "none" and event["hit_percent"] == 0 for event in cache)
    assert all(event["uncached"] > 0 for event in cache)


def test_an_entry_older_than_the_ttl_is_not_read() -> None:
    cache = of_kind(run(cached_tape(cache_rules={"min_tokens": 1, "ttl_ms": 1}), CACHE), "cache")
    assert cache[1]["read"] == 0
    assert cache[1]["write"] > 0


def test_the_cache_is_only_consulted_for_a_call_that_returns_a_reply() -> None:
    tape = cached_tape(
        script=[{"error": "overloaded"}, {"tools": [["list_files", {}]]}, {"say": "done"}]
    )
    retry = {"retry": {"max_attempts": 2, "base_ms": 10, "cap_ms": 10, "jitter": "none"}}
    cache = of_kind(run(tape, {**CACHE, **retry}), "cache")
    assert len(cache) == 2  # one per successful call; the failed attempt wrote nothing


def test_model_reply_and_wire_response_usage_carry_the_cache_fields() -> None:
    result = run(cached_tape(), CACHE)
    usage = of_kind(result, "model_reply")[0]["usage"]
    assert set(usage) == {
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
        "output_tokens",
    }
    response = [entry for entry in result.wire if "id" in entry][0]
    assert set(response["usage"]) == set(usage)


def test_the_cost_uses_the_cache_prices() -> None:
    result = run(cached_tape(), CACHE)
    cache = of_kind(result, "cache")
    replies = of_kind(result, "model_reply")
    expected = 0
    for event, reply in zip(cache, replies, strict=True):
        expected += event["uncached"] * 1000 + event["write"] * 1250 + event["read"] * 100
        expected += reply["usage"]["output_tokens"] * 2000
    assert of_kind(result, "run_end")[0]["cost"] == expected


def test_the_wire_request_marks_the_last_block_and_the_history_does_not() -> None:
    tape = cached_tape()
    harness = Harness(tape, make_board_cached(), 1, resolve_prices(tape.pricing, None))
    harness.run()
    requests = [entry for entry in harness.wire if "messages" in entry]
    assert requests[1]["messages"][-1]["content"][-1]["cache_control"] == {"type": "ephemeral"}
    for message in harness.messages:
        for block in message["content"]:
            assert "cache_control" not in block


def make_board_cached() -> Any:
    from rein.board import board_from_dict

    return board_from_dict({"id": "b", "label": "B", "modules": CACHE})


def test_cache_without_cache_rules_or_prices_is_refused() -> None:
    no_rules = make_tape(pricing=PRICES, script=TWO)
    with pytest.raises(BoardError):
        run(no_rules, CACHE)
    no_prices = make_tape(cache_rules=RULES, script=TWO)
    with pytest.raises(BoardError):
        run(no_prices, CACHE)


def test_the_loader_refuses_bad_cache_rules() -> None:
    with pytest.raises(TapeError):
        make_tape(cache_rules={"min_tokens": 1})
    with pytest.raises(TapeError):
        make_tape(cache_rules={"min_tokens": -1, "ttl_ms": 5})


def test_fact_pricing_reads_the_cache_keys_when_the_fact_has_them() -> None:
    prices = resolve_prices({"fact": "models.sonnet-5-5-price"}, FACTS)
    assert (prices.cache_write_milli, prices.cache_read_milli) == (
        2500,
        100,
    )  # 2.5 and 0.1 per MTok
    fake = {
        "x": {
            "value": {
                "input_usd_per_mtok": 2,
                "output_usd_per_mtok": 10,
                "cache_hit_usd_per_mtok": 0.2,
            }
        }
    }
    partial = resolve_prices({"fact": "x"}, fake)  # no write price: a cache board refuses
    assert (partial.cache_write_milli, partial.cache_read_milli) == (None, 200)


def test_inline_cache_prices_are_optional() -> None:
    assert (
        resolve_prices(
            {"input_milli_per_mtok": 1, "output_milli_per_mtok": 2}, None
        ).cache_read_milli
        is None
    )
