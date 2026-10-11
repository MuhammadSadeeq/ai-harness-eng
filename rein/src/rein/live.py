"""The live model: one turn of a real Messages API call behind the harness (BP-4.2, SPEC §7.4).

It answers the same way the script does (``model.ModelCall``): it sends the wire payload the harness
built for the turn, unchanged, and turns the response into a Reply with the API's own usage. The
tape's workspace stays virtual, so a real model cannot touch the learner's files, and the tape's
checks still decide ``passed``.

Constraints (SPEC §7.4). Each claim about the API cites its fact id in a comment. A claim with no
fact yet is marked ``no fact`` and reported, not asserted.
"""

from __future__ import annotations

import json
import math
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .model import BudgetStop, CallContext, ErrorOutcome, LiveUsage, Reply, ToolUse
from .pricing import Prices, PricingError, resolve_prices
from .spec import MODEL_ERROR_MS, REDACTED, WIRE_MAX_TOKENS

if TYPE_CHECKING:  # the anthropic package is the optional `live` extra; the core imports nothing
    import anthropic

KEY_ENV = "ANTHROPIC_API_KEY"  # the only source of the learner's key (SPEC §7.4)

# Model id -> the price fact that prices it (facts/models.yaml; ids: models.ids-current).
LIVE_PRICE_FACTS: dict[str, str] = {
    "claude-sonnet-5-5": "models.sonnet-5-5-price",
    "claude-opus-5-5": "models.opus-5-5-price",
    "claude-haiku-5-5": "models.haiku-5-5-price-up-to-100k",
    "claude-fable-5-1": "models.fable-5-1-price",
}


class LiveError(RuntimeError):
    """A live run that cannot start or go on. The message is for the learner, never the key."""


@dataclass
class SpendCap:
    """The run's spend cap in nano-units (1 USD = 1e9), shared by every request of the run."""

    limit: int
    spent: int = 0

    @classmethod
    def from_usd(cls, usd: float) -> SpendCap:
        if not math.isfinite(usd) or usd <= 0:
            raise LiveError("--max-cost-usd must be a finite number above zero")
        return cls(limit=round(usd * 1_000_000_000))


def key_from_env(environ: Mapping[str, str]) -> str:
    key = environ.get(KEY_ENV, "")
    if not key:
        raise LiveError(f"{KEY_ENV} is not set: a live run needs your own key in that variable")
    return key


def redact(text: str, key: str | None) -> str:
    """The key never reaches a message: every error text passes through here before printing."""
    return text.replace(key, REDACTED) if key else text


def make_client(key: str, base_url: str | None) -> anthropic.Anthropic:
    try:
        import anthropic
    except ImportError:
        raise LiveError(
            'the live path needs the optional extra: pip install -e "./rein[live]"'
        ) from None

    # The SDK's own retries are off (api.error-sdk-retries counts them by default): the harness
    # retries, so the trace shows every attempt.
    return anthropic.Anthropic(api_key=key, base_url=base_url, max_retries=0)


def check_model(client: anthropic.Anthropic, model_id: str) -> None:
    """The model id must be listed before a run. No fact yet for the Models API (report)."""
    import anthropic

    try:
        client.models.retrieve(model_id)
    except anthropic.NotFoundError:
        raise LiveError(f"model {model_id!r} is not listed by the Models API") from None
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        raise LiveError("the API refused the key: check the value of ANTHROPIC_API_KEY") from None
    except anthropic.APIConnectionError:
        raise LiveError("the API could not be reached") from None
    except anthropic.APIStatusError as exc:
        raise LiveError(f"the Models API answered {exc.status_code} for {model_id!r}") from None


def live_prices(model_id: str, facts: dict[str, Any] | None) -> tuple[Prices, int | None]:
    """The prices of a live model from the facts registry, and its prompt ceiling when the fact
    gives one (the Haiku price applies up to 100,000 prompt tokens:
    models.haiku-5-5-price-up-to-100k)."""
    fact_id = LIVE_PRICE_FACTS.get(model_id)
    if fact_id is None:
        raise LiveError(f"no price fact is mapped for model {model_id!r} (LIVE_PRICE_FACTS)")
    if facts is None:
        raise LiveError("a live run needs the facts registry: pass --facts site/data/facts.json")
    try:
        prices = resolve_prices({"fact": fact_id}, facts)
    except PricingError as exc:
        raise LiveError(str(exc)) from None
    value = facts[fact_id]["value"]
    ceiling = value.get("max_prompt_tokens")
    return prices, int(ceiling) if ceiling is not None else None


def error_type(status: int) -> str:
    """Status to the harness's error type (spec ERROR_TYPES). Facts: api.error-429-rate-limit,
    api.error-529-overloaded, api.error-504-timeout, api.error-500-api-error,
    api.error-400-invalid-request."""
    if status == 429:
        return "rate_limit"
    if status == 529:
        return "overloaded"
    if status == 504:
        return "timeout"
    if status >= 500:
        return "api_error"
    return "invalid_request"


def retry_after_ms(headers: Mapping[str, str]) -> int:
    """The retry-after header is seconds (fact api.retry-after-meaning); 0 when absent."""
    raw = headers.get("retry-after")
    if raw is None:
        return 0
    try:
        return max(0, round(float(raw) * 1000))
    except ValueError:
        return 0


def cost_nano(usage: LiveUsage, prices: Prices) -> int:
    """Cost in nano-units from the API's counts and the dated prices: the harness's own formula."""
    return (
        usage.input_tokens * prices.input_milli
        + usage.cache_creation_input_tokens * (prices.cache_write_milli or 0)
        + usage.cache_read_input_tokens * (prices.cache_read_milli or 0)
        + usage.output_tokens * prices.output_milli
    )


def reply_from_response(response: Any, latency_ms: int) -> Reply:
    """The harness's Reply from a Message: every content block as received, text, tool calls and
    the stop reason. Thinking blocks stay in ``content`` with their signatures (append-only history;
    no fact yet for the thinking-block rule: report)."""
    content: list[dict[str, Any]] = []
    tool_uses: list[ToolUse] = []
    texts: list[str] = []
    for block in response.content:
        data: dict[str, Any] = block.model_dump(mode="json", exclude_none=True)
        content.append(data)
        if data.get("type") == "tool_use":
            tool_uses.append(
                ToolUse(id=str(data["id"]), name=str(data["name"]), input=dict(data["input"]))
            )
        elif data.get("type") == "text":
            texts.append(str(data["text"]))
    usage = response.usage
    counts = LiveUsage(
        input_tokens=int(usage.input_tokens),
        output_tokens=int(usage.output_tokens),
        cache_creation_input_tokens=int(usage.cache_creation_input_tokens or 0),
        cache_read_input_tokens=int(usage.cache_read_input_tokens or 0),
    )
    return Reply(
        say="".join(texts) if texts else None,
        content=content,
        tool_uses=tool_uses,
        # an empty stop reason is "error" to the harness
        stop_reason=str(response.stop_reason or ""),
        latency_ms=latency_ms,
        output_tokens=counts.output_tokens,
        usage=counts,
    )


@dataclass
class LiveModel:
    """A real model behind the harness. One instance serves one run; the spend cap may be shared."""

    model_id: str
    client: Any  # an anthropic.Anthropic; typed Any so the core never imports the SDK
    prices: Prices
    cap: SpendCap
    max_prompt_tokens: int | None = None
    calls: int = 0  # requests actually sent

    def call(self, ctx: CallContext) -> Reply | ErrorOutcome | BudgetStop:
        payload = ctx.wire
        if payload is None:
            raise LiveError("internal error: a live model needs the wire payload of the turn")
        # The harness's payload, unchanged, except output_config: the SDK sends it as an extra body
        # field (fact api.effort-location: effort is set with output_config.effort on the request).
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        # Upper bounds, so the cap can never be passed: a token is at least one byte, so the body's
        # bytes bound the input tokens; the output is at most the request's max_tokens
        # (WIRE_MAX_TOKENS).
        if self.max_prompt_tokens is not None and len(body) > self.max_prompt_tokens:
            raise LiveError(
                f"the prompt may pass {self.max_prompt_tokens:,} tokens, where the price of "
                f"{self.model_id} changes (models.haiku-5-5-price-up-to-100k)"
            )
        input_price = max(self.prices.input_milli, self.prices.cache_write_milli or 0)
        worst = len(body) * input_price + WIRE_MAX_TOKENS * self.prices.output_milli
        if self.cap.spent + worst > self.cap.limit:
            return BudgetStop(limit=self.cap.limit, spent=self.cap.spent)
        params = dict(payload)
        output_config = params.pop("output_config", None)
        extra: dict[str, Any] = (
            {"extra_body": {"output_config": output_config}} if output_config is not None else {}
        )
        import anthropic

        started = time.monotonic()
        self.calls += 1
        try:
            response = self.client.messages.create(**params, **extra)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
            # fact api.error-401-authentication: the key is wrong; no retry can help
            raise LiveError(
                "the API refused the key: check the value of ANTHROPIC_API_KEY"
            ) from None
        except anthropic.APITimeoutError:
            return ErrorOutcome(type="timeout", retry_after_ms=0, error_ms=MODEL_ERROR_MS)
        except anthropic.APIStatusError as exc:
            return ErrorOutcome(
                type=error_type(exc.status_code),
                retry_after_ms=retry_after_ms(
                    {name.lower(): value for name, value in exc.response.headers.items()}
                ),
                error_ms=MODEL_ERROR_MS,
            )
        except anthropic.APIConnectionError:
            return ErrorOutcome(type="api_error", retry_after_ms=0, error_ms=MODEL_ERROR_MS)
        latency = round((time.monotonic() - started) * 1000)
        # A 200 body that is not a Message (a proxy's HTML page) or has no usage cannot be priced:
        # it is a one-line error for the learner, not a traceback.
        if (
            not isinstance(response, anthropic.types.Message)
            or getattr(response, "usage", None) is None
        ):
            raise LiveError(
                "the API answered with something other than a Messages API reply: "
                "check the API address"
            )
        reply = reply_from_response(response, latency)
        if reply.usage is not None:
            self.cap.spent += cost_nano(reply.usage, self.prices)
        return reply


def run_live_eval(
    spec: Any,
    tapes: Mapping[str, Any],
    board: Any,
    client: Any,
    model_id: str,
    prices: Prices,
    max_prompt_tokens: int | None,
    cap: SpendCap,
    trials: int,
) -> list[dict[str, Any]]:
    """The eval's trial rows (the same keys as evals.run_eval) for a live model. Every trial is one
    run of the task's tape on the board; all trials share one spend cap. The seed of trial k of task
    i is seed_base + 1000 * i + k, as the model grader's draws are."""
    from .harness import Harness

    rows: list[dict[str, Any]] = []
    for index, task in enumerate(spec.tasks):
        tape = tapes[task.tape]
        for trial in range(1, trials + 1):
            model = LiveModel(
                model_id=model_id,
                client=client,
                prices=prices,
                cap=cap,
                max_prompt_tokens=max_prompt_tokens,
            )
            seed = spec.seed_base + 1000 * index + trial
            result = Harness(tape, board, seed, prices, live=model).run()
            rows.append(
                {
                    "task": task.id,
                    "trial": trial,
                    "status": result.status,
                    "passed": result.passed,
                    "code": result.status == "done" and result.passed,
                    "leaked": any(event["kind"] == "leak" for event in result.events),
                    "turns": result.turns,
                    "tokens": {"input": result.tokens_in, "output": result.tokens_out},
                    "cost": result.cost,
                }
            )
    return rows
