"""Tests for tools/check_facts.py, using the fixtures under tools/tests/fixtures/facts/."""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "facts"
TODAY = dt.date(2026, 10, 10)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_facts", ROOT / "tools" / "check_facts.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


checker = _load()


def _case(
    name: str,
    links: bool = False,
    warn_days: int = 75,
    fetch: Callable[[str, str], int] | None = None,
) -> Any:
    case = FIXTURES / name
    return checker.run(case / "facts", case / "site", TODAY, links, warn_days, fetch)


def _errors(report: Any) -> list[str]:
    return [p.message for p in report.problems if not p.warning]


def _warnings(report: Any) -> list[str]:
    return [p.message for p in report.problems if p.warning]


def test_good_registry_passes_with_exact_summary() -> None:
    report = _case("good")
    assert _errors(report) == []
    assert report.last_line() == (
        "check_facts: 3 facts OK (2 verified, 1 unverifiable, 0 contradicted), "
        "2 page references"
    )


def test_vendor_pages_are_not_scanned() -> None:
    report = _case("good")
    assert report.references == 2
    assert not any("does.not.exist" in message for message in _errors(report))


@pytest.mark.parametrize(
    ("case", "expected"),
    [
        ("bad_id", "invalid id 'API.Bad-Id'"),
        ("bad_prefix", "must start with 'api.'"),
        ("bad_dupe", "duplicate id 'api.dup'"),
        ("bad_missing", "missing required key 'quote'"),
        ("bad_unknown", "unknown key 'colour'"),
        ("future", "verified_on is after --today"),
        ("bad_note", "note is required when status is unverifiable"),
        ("bad_source", "source must start with https://"),
        ("bad_yaml", "invalid YAML"),
        ("unverifiable", "fact 'mcp.example-unverified' is unverifiable"),
        ("bad_area", "unknown area 'misc'"),
    ],
)
def test_bad_registry_cases_are_reported(case: str, expected: str) -> None:
    report = _case(case)
    assert any(expected in message for message in _errors(report)), _errors(report)
    assert report.last_line().startswith("check_facts: FAILED (")


def test_stale_volatile_fact_used_by_a_page_is_an_error() -> None:
    report = _case("stale")
    errors = _errors(report)
    assert len(errors) == 1
    assert "'api.stale-used' is stale (131 days" in errors[0]


def test_stale_volatile_fact_not_used_only_warns() -> None:
    report = _case("stale")
    assert any(
        "volatile fact 'api.stale-unused' is stale" in message and "not used" in message
        for message in _warnings(report)
    )
    assert not any("api.stale-unused" in message for message in _errors(report))


def test_unknown_fact_id_in_a_page_is_an_error() -> None:
    report = checker.run(
        FIXTURES / "good" / "facts", FIXTURES / "unknown" / "site", TODAY
    )
    assert _errors(report) == ["unknown fact id 'api.missing'"]


def test_warn_days_applies_to_volatile_facts_only() -> None:
    report = _case("good", warn_days=0)
    assert _errors(report) == []
    warnings = _warnings(report)
    assert len(warnings) == 1
    assert "volatile fact 'api.example-stop' is 9 days old" in warnings[0]


def test_links_are_checked_with_an_injected_fetcher() -> None:
    calls: list[tuple[str, str]] = []

    def fake_fetch(url: str, method: str) -> int:
        calls.append((url, method))
        if url.endswith("/head-only") and method == "HEAD":
            return 405
        if url.endswith("/down"):
            raise OSError("no route to host")
        return {"ok": 200, "gone": 404, "head-only": 200, "alt": 500}[url.rsplit("/", 1)[1]]

    report = _case("links", links=True, fetch=fake_fetch)
    errors = _errors(report)
    assert any("api.link-gone" in e and "HTTP 404" in e for e in errors), errors
    assert any("api.link-down" in e and "network failure" in e for e in errors), errors
    assert any("api.link-alt" in e and "HTTP 500" in e for e in errors), errors
    assert not any("api.link-head-only" in e for e in errors), errors
    assert not any("api.link-ok" in e for e in errors), errors
    assert not any("api.link-unverified" in e for e in errors), errors
    warnings = _warnings(report)
    assert any("api.link-unverified" in w and "HTTP 404" in w for w in warnings), warnings
    assert calls.count(("https://example.com/ok", "HEAD")) == 1
    assert ("https://example.com/head-only", "GET") in calls


def test_links_are_not_fetched_without_the_flag() -> None:
    def refuse(url: str, method: str) -> int:
        raise AssertionError(f"network used without --links: {url} {method}")

    report = _case("links", links=False, fetch=refuse)
    assert _errors(report) == []


def test_cli_returns_zero_and_last_line_for_good_registry(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = checker.main(
        [
            "--facts",
            str(FIXTURES / "good" / "facts"),
            "--site",
            str(FIXTURES / "good" / "site"),
            "--today",
            "2026-10-10",
        ]
    )
    out = capsys.readouterr().out.strip().splitlines()
    assert code == 0
    assert out[-1] == (
        "check_facts: 3 facts OK (2 verified, 1 unverifiable, 0 contradicted), "
        "2 page references"
    )


def test_cli_returns_one_and_failed_line_for_bad_registry(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = checker.main(
        ["--facts", str(FIXTURES / "bad_dupe" / "facts"), "--site", str(FIXTURES / "none")]
    )
    out = capsys.readouterr().out.strip().splitlines()
    assert code == 1
    assert out[-1].startswith("check_facts: FAILED (")


def test_missing_registry_has_zero_facts(tmp_path: Path) -> None:
    report = checker.run(tmp_path / "absent", tmp_path / "absent-site", TODAY)
    assert report.last_line() == (
        "check_facts: 0 facts OK (0 verified, 0 unverifiable, 0 contradicted), "
        "0 page references"
    )


# The span text rule (FACTS §6, the ruling): a span's hard tokens (numbers, <code>, quoted strings,
# identifier-like words) must appear in its fact's claim or quote, compared case-insensitively.


def _span_case(tmp_path: Path, claim: str, quote: str, span: str) -> Any:
    """A one-fact registry and one page whose span is ``span``, run through the checker."""
    facts = tmp_path / "facts"
    site = tmp_path / "site"
    facts.mkdir()
    site.mkdir()
    entry = (
        f'- id: harnesses.example\n  claim: {json.dumps(claim)}\n'
        f"  source: https://example.com/doc\n  quote: {json.dumps(quote)}\n"
        "  verified_on: 2026-10-01\n  volatility: stable\n"
    )
    (facts / "harnesses.yaml").write_text(entry, encoding="utf-8")
    (site / "index.html").write_text(
        f'<p>{span}</p>\n<span class="fact" data-fact="harnesses.example">{span}</span>\n',
        encoding="utf-8",
    )
    return checker.run(facts, site, TODAY)


SANDBOX_CLAIM = (
    "Codex's sandbox modes, by the repository's serde names, are read-only (the default), "
    "workspace-write and danger-full-access."
)
SANDBOX_QUOTE = (
    '#[serde(rename = "read-only")] #[default] ReadOnly, '
    '#[serde(rename = "workspace-write")] WorkspaceWrite'
)


def test_a_span_that_adds_a_hard_token_fails_with_its_token_and_fact_id(tmp_path: Path) -> None:
    span = (
        "Codex's sandbox modes are read-only, workspace-write and danger-full-access, "
        "and danger-full-access-by-default is set."
    )
    report = _span_case(tmp_path, SANDBOX_CLAIM, SANDBOX_QUOTE, span)
    errors = _errors(report)
    assert len(errors) == 1
    assert "harnesses.example" in errors[0]
    assert "danger-full-access-by-default" in errors[0]
    assert report.problems[0].line == 2


def test_a_span_that_only_paraphrases_its_claim_passes(tmp_path: Path) -> None:
    span = (
        "Codex has three sandbox modes: read-only (the default), workspace-write, "
        "and danger-full-access."
    )
    assert _errors(_span_case(tmp_path, SANDBOX_CLAIM, SANDBOX_QUOTE, span)) == []


def test_reordering_the_default_keeps_every_hard_token_so_the_token_rule_passes_it(
    tmp_path: Path,
) -> None:
    # Known limit of the ruling: the audit's default swap ("workspace-write (the default)") uses
    # only tokens the claim already has, and "default" is not a hard token, so the rule misses it.
    span = (
        "Codex's sandbox modes are workspace-write (the default), read-only and danger-full-access."
    )
    assert _errors(_span_case(tmp_path, SANDBOX_CLAIM, SANDBOX_QUOTE, span)) == []


def test_a_number_that_differs_from_the_claim_fails(tmp_path: Path) -> None:
    claim = "Cache reads cost 0.1x base input, 0.025x on one model."
    report = _span_case(tmp_path, claim, claim, "Cache reads cost 0.05x base input.")
    errors = _errors(report)
    assert any("'0.05'" in error for error in errors), errors


def test_numbers_match_with_units_and_thousands_separators(tmp_path: Path) -> None:
    claim = "A 1M-token context window, and prompts up to 100,000 tokens cost $0.10."
    span = "A 1M tokens context window, and prompts up to 100000 tokens cost $0.10."
    assert _errors(_span_case(tmp_path, claim, claim, span)) == []


def test_a_number_inside_a_longer_number_does_not_match(tmp_path: Path) -> None:
    claim = "The window is 4000 tokens."
    report = _span_case(tmp_path, claim, claim, "The window is 400 tokens.")
    assert len(_errors(report)) == 1 and "'400'" in _errors(report)[0]


def test_code_and_quoted_strings_are_hard_tokens(tmp_path: Path) -> None:
    claim = "The request carries a limit on its output."
    report = _span_case(
        tmp_path, claim, claim, "The request sets <code>max_tokens</code> and \"stop reason\"."
    )
    tokens = " ".join(p.message for p in report.problems)
    assert "'max_tokens'" in tokens and "'stop reason'" in tokens


def test_a_hyphen_in_an_identifier_matches_a_space_and_case_is_ignored(tmp_path: Path) -> None:
    claim = "The advisory names Supply Chain Vulnerabilities, and READ ONLY is the default."
    span = "The advisory names supply-chain vulnerabilities; read-only is the default."
    assert _errors(_span_case(tmp_path, claim, claim, span)) == []


def test_an_identifier_must_be_a_whole_word(tmp_path: Path) -> None:
    claim = "The tool is tool_use_block in the reply."
    report = _span_case(tmp_path, claim, claim, "The tool is tool_use in the reply.")
    assert len(_errors(report)) == 1 and "'tool_use'" in _errors(report)[0]


def test_a_span_with_no_hard_tokens_passes_whatever_it_says(tmp_path: Path) -> None:
    assert _errors(_span_case(tmp_path, "A claim.", "A quote.", "Something plain.")) == []


def test_element_inner_html_reads_the_span_including_nested_code(tmp_path: Path) -> None:
    text = (
        '<p>x <span class="fact" data-fact="a.b">one <code>two</code> '
        "<span>three</span></span> y</p>"
    )
    at = text.index("data-fact")
    inner = checker.element_inner_html(text, at)
    assert inner == 'one <code>two</code> <span>three</span>'
    assert checker.hard_tokens(inner) == ["two"], "the code is hard; the plain words are not"
