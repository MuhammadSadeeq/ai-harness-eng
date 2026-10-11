"""check_facts: checks the facts registry and every page that uses it (docs/FACTS.md).

Usage: check_facts.py [--facts DIR] [--site DIR] [--today YYYY-MM-DD] [--links] [--warn-days N]

Problems print as ``path:line: message``; the last line is the summary.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FACTS = REPO_ROOT / "facts"
DEFAULT_SITE = REPO_ROOT / "site"
FRESH_DAYS = 90
DEFAULT_WARN_DAYS = 75
LINK_TIMEOUT = 15.0
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)
REQUIRED_KEYS = frozenset({"id", "claim", "source", "quote", "verified_on", "volatility"})
OPTIONAL_KEYS = frozenset({"status", "kind", "value", "note", "source_alt"})
STATUSES = ("verified", "unverifiable", "contradicted")
KINDS = ("company-report", "paper", "spec", "docs")
VOLATILITIES = ("volatile", "stable")
AREAS = frozenset(
    {
        "api",
        "models",
        "python",
        "harnesses",
        "mcp",
        "otel",
        "owasp",
        "skills",
        "agentsmd",
        "a2a",
        "aaif",
        "anthropic",
        "openai",
        "security",
        "evals",
        "papers",
        "careers",
        "jsonschema",
        "web",
        "pytest",
        "docker",
        "git",
    }
)
ID_PATTERN = re.compile(r"^[a-z0-9]+(\.[a-z0-9-]+)+$")
DATA_FACT_PATTERN = re.compile(r"""data-fact\s*=\s*(?:"([^"]*)"|'([^']*)')""")
VOID_TAGS = frozenset(
    {
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source",
        "track", "wbr",
    }
)
TAG_NAME = re.compile(r"<([A-Za-z][A-Za-z0-9-]*)")
CODE_ELEMENT = re.compile(r"<code\b[^>]*>(.*?)</code>", re.IGNORECASE | re.DOTALL)
TAG = re.compile(r"<[^>]+>")
QUOTED = re.compile(r'"([^"\n]+)"|\u201c([^\u201d\n]+)\u201d')
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
WORD = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.\-]*")
THOUSANDS = re.compile(r"(?<=\d),(?=\d{3}(?!\d))")
NUMBER_TOKEN = re.compile(r"\d+(?:[.,]\d+)*")

Fetch = Callable[[str, str], int]


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str
    warning: bool = False

    def render(self) -> str:
        prefix = "warning: " if self.warning else ""
        return f"{self.path}:{self.line}: {prefix}{self.message}"


@dataclass
class Fact:
    id: str
    file: str
    line: int
    status: str
    volatility: str
    verified_on: dt.date | None
    source: str | None
    source_alt: str | None
    claim: str = ""
    quote: str = ""

    def age_days(self, today: dt.date) -> int | None:
        if self.verified_on is None:
            return None
        return (today - self.verified_on).days


@dataclass
class Report:
    problems: list[Problem] = field(default_factory=list)
    facts: int = 0
    counts: dict[str, int] = field(default_factory=lambda: dict.fromkeys(STATUSES, 0))
    references: int = 0

    def error(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message))

    def warn(self, path: str, line: int, message: str) -> None:
        self.problems.append(Problem(path, line, message, warning=True))

    def error_count(self) -> int:
        return sum(1 for problem in self.problems if not problem.warning)

    def last_line(self) -> str:
        if self.error_count():
            return f"check_facts: FAILED ({self.error_count()} problems)"
        return (
            f"check_facts: {self.facts} facts OK ({self.counts['verified']} verified, "
            f"{self.counts['unverifiable']} unverifiable, {self.counts['contradicted']} "
            f"contradicted), {self.references} page references"
        )


def run(
    facts_dir: Path,
    site_dir: Path,
    today: dt.date,
    links: bool = False,
    warn_days: int = DEFAULT_WARN_DAYS,
    fetch: Fetch | None = None,
) -> Report:
    """Check the registry in ``facts_dir`` and the pages in ``site_dir``."""
    report = Report()
    facts = load_registry(facts_dir, today, report)
    report.facts = len(facts)
    for fact in facts:
        if fact.status in report.counts:
            report.counts[fact.status] += 1
    index = {fact.id: fact for fact in facts}
    used: set[str] = set()
    for page, line, fact_id, inner in scan_pages(site_dir):
        report.references += 1
        shown = _display(page)
        referenced = index.get(fact_id)
        if referenced is None:
            report.error(shown, line, f"unknown fact id '{fact_id}'")
            continue
        used.add(fact_id)
        if inner is None:
            report.error(shown, line, f"fact span {fact_id} is not closed")
        else:
            _check_span_tokens(referenced, inner, shown, line, report)
        if referenced.status != "verified":
            report.error(
                shown,
                line,
                f"fact '{fact_id}' is {referenced.status}; pages may only use verified facts",
            )
        age = referenced.age_days(today)
        if referenced.volatility == "volatile" and age is not None and age > FRESH_DAYS:
            report.error(
                shown,
                line,
                f"fact '{fact_id}' is stale ({age} days since verified_on; limit {FRESH_DAYS})",
            )
    for fact in facts:
        _freshness_warnings(fact, today, used, warn_days, report)
    if links:
        _check_links(facts, fetch or http_fetch, report)
    return report


def load_registry(facts_dir: Path, today: dt.date, report: Report) -> list[Fact]:
    """Parse every ``*.yaml`` file in ``facts_dir`` and validate each entry."""
    facts: list[Fact] = []
    seen: dict[str, str] = {}
    if not facts_dir.is_dir():
        return facts
    for file in sorted(facts_dir.glob("*.yaml")):
        if file.stem not in AREAS:
            report.error(
                _display(file),
                1,
                f"unknown area '{file.stem}'; a new area needs a director decision (FACTS §2)",
            )
        for line, data, key_lines in _load_file(file, report):
            fact = _validate_entry(file, line, data, key_lines, today, report)
            if fact is None:
                continue
            if fact.id in seen:
                report.error(
                    _display(file),
                    key_lines.get("id", line),
                    f"duplicate id '{fact.id}' (first defined in {seen[fact.id]})",
                )
                continue
            seen[fact.id] = _display(file)
            facts.append(fact)
    return facts


def _load_file(file: Path, report: Report) -> list[tuple[int, dict[str, Any], dict[str, int]]]:
    display = _display(file)
    text = file.read_text(encoding="utf-8")
    try:
        loaded = yaml.safe_load(text)
        root = yaml.compose(text, Loader=yaml.SafeLoader)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        report.error(display, mark.line + 1 if mark is not None else 0, f"invalid YAML: {exc}")
        return []
    if loaded is None:
        return []
    if not isinstance(loaded, list):
        report.error(display, 1, "registry file must be a YAML list of mappings")
        return []
    nodes = root.value if isinstance(root, yaml.SequenceNode) else []
    entries: list[tuple[int, dict[str, Any], dict[str, int]]] = []
    for index, item in enumerate(loaded):
        node = nodes[index] if index < len(nodes) else None
        line = node.start_mark.line + 1 if node is not None else 0
        if not isinstance(item, dict):
            report.error(display, line, "entry must be a mapping")
            continue
        key_lines: dict[str, int] = {}
        if isinstance(node, yaml.MappingNode):
            for key_node, _ in node.value:
                if isinstance(key_node, yaml.ScalarNode):
                    key_lines[str(key_node.value)] = key_node.start_mark.line + 1
        entries.append((line, item, key_lines))
    return entries


def _validate_entry(
    file: Path,
    line: int,
    data: dict[str, Any],
    key_lines: dict[str, int],
    today: dt.date,
    report: Report,
) -> Fact | None:
    display = _display(file)

    def at(key: str) -> int:
        return key_lines.get(key, line)

    for key in data:
        if key not in REQUIRED_KEYS | OPTIONAL_KEYS:
            report.error(display, at(str(key)), f"unknown key '{key}'")
    for key in sorted(REQUIRED_KEYS):
        if key not in data:
            report.error(display, line, f"missing required key '{key}'")
    fact_id = data.get("id")
    if not isinstance(fact_id, str):
        report.error(display, at("id"), "id must be a string")
        return None
    if not ID_PATTERN.match(fact_id):
        report.error(display, at("id"), f"invalid id '{fact_id}' (expected <area>.<kebab-case>)")
    if not fact_id.startswith(f"{file.stem}."):
        report.error(display, at("id"), f"id '{fact_id}' must start with '{file.stem}.'")
    for key in ("claim", "quote"):
        value = data.get(key)
        if key in data and (not isinstance(value, str) or not value.strip()):
            report.error(display, at(key), f"{key} must be a non-empty string")
    source = _https_url(data, "source", display, at, report)
    source_alt = _https_url(data, "source_alt", display, at, report)
    verified_on = _as_date(data.get("verified_on"))
    if "verified_on" in data:
        if verified_on is None:
            report.error(display, at("verified_on"), "verified_on must be a date (YYYY-MM-DD)")
        elif verified_on > today:
            report.error(display, at("verified_on"), "verified_on is after --today")
    volatility = data.get("volatility")
    if "volatility" in data and volatility not in VOLATILITIES:
        report.error(display, at("volatility"), "volatility must be volatile or stable")
    status = data.get("status", "verified")
    if status not in STATUSES:
        report.error(display, at("status"), "status must be verified, unverifiable or contradicted")
    if "kind" in data and data["kind"] not in KINDS:
        report.error(display, at("kind"), f"kind must be one of {', '.join(KINDS)}")
    if "value" in data and not isinstance(data["value"], dict):
        report.error(display, at("value"), "value must be a mapping")
    note = data.get("note")
    if status != "verified":
        if not isinstance(note, str) or not note.strip():
            report.error(display, at("status"), f"note is required when status is {status}")
    elif "note" in data and (not isinstance(note, str) or not note.strip()):
        report.error(display, at("note"), "note must be a non-empty string")
    return Fact(
        id=fact_id,
        file=display,
        line=line,
        status=str(status),
        volatility=str(volatility),
        verified_on=verified_on,
        source=source,
        source_alt=source_alt,
        claim=_text(data.get("claim")),
        quote=_text(data.get("quote")),
    )


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _https_url(
    data: dict[str, Any],
    key: str,
    display: str,
    at: Callable[[str], int],
    report: Report,
) -> str | None:
    if key not in data:
        return None
    value = data[key]
    if not isinstance(value, str) or not value.startswith("https://"):
        report.error(display, at(key), f"{key} must start with https://")
        return None
    return value


def _as_date(value: object) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return None
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value)
        except ValueError:
            return None
    return None


def scan_pages(site_dir: Path) -> list[tuple[Path, int, str, str | None]]:
    """Return ``(page, line, fact_id, inner_html)`` for every ``data-fact`` attribute in the site.

    inner_html is what the element holds: the span's text, with any <code> inside it. None when the
    span is never closed, so its text cannot be known.
    """
    references: list[tuple[Path, int, str, str | None]] = []
    if not site_dir.is_dir():
        return references
    for page in sorted(site_dir.rglob("*.html")):
        relative = page.relative_to(site_dir).parts
        if relative and relative[0] == "vendor":
            continue
        text = page.read_text(encoding="utf-8", errors="replace")
        for match in DATA_FACT_PATTERN.finditer(text):
            fact_id = match.group(1) if match.group(1) is not None else match.group(2)
            inner = element_inner_html(text, match.start())
            references.append((page, text.count("\n", 0, match.start()) + 1, fact_id, inner))
    return references


def element_inner_html(text: str, attribute_at: int) -> str | None:
    """The HTML an element holds, from the attribute at attribute_at to its closing tag.

    None when the element has no closing tag: an unclosed span has no text of its own, so the rest
    of the page must not be read as its claim. An empty string for a void element.
    """
    start = text.rfind("<", 0, attribute_at)
    name = TAG_NAME.match(text, start) if start >= 0 else None
    if name is None:
        return ""
    tag = name.group(1).lower()
    if tag in VOID_TAGS:
        return ""
    open_end = text.find(">", attribute_at)
    if open_end < 0:
        return None
    open_end += 1
    depth = 1
    for tag_match in re.finditer(rf"<(/?){re.escape(tag)}\b[^>]*>", text[open_end:], re.IGNORECASE):
        if tag_match.group(1):
            depth -= 1
            if depth == 0:
                return text[open_end:open_end + tag_match.start()]
        elif not tag_match.group(0).endswith("/>"):
            depth += 1
    return None


def _plain(markup: str) -> str:
    """The text of some HTML: tags dropped, entities decoded, white space made single spaces."""
    return " ".join(html.unescape(TAG.sub(" ", markup)).split())


def _thousands(text: str) -> str:
    """Drops the comma of a thousands group, so 1,000 and 1000 are the same number."""
    return THOUSANDS.sub("", text)


def _identifier_like(word: str) -> bool:
    """An identifier-like word: it has _, a hyphen, a dot between letters, a digit, or CamelCase."""
    return bool(
        "_" in word
        or "-" in word
        or re.search(r"[A-Za-z]\.[A-Za-z]", word)
        or re.search(r"\d", word)
        or re.search(r"[a-z][A-Z]", word)
    )


def hard_tokens(markup: str) -> list[str]:
    """The tokens a span may not state without its fact.

    Numbers, <code>, quoted strings and identifiers. Compared case-insensitively with the claim and
    quote (see _check_span_tokens).
    """
    tokens: list[str] = []
    for code in CODE_ELEMENT.findall(markup):
        tokens.append(_plain(code))
    text = _plain(markup)
    for match in QUOTED.finditer(text):
        tokens.append(match.group(1) or match.group(2))
    plain = _thousands(text)
    tokens.extend(NUMBER.findall(plain))
    for word in WORD.findall(plain):
        word = word.rstrip(".-")
        if _identifier_like(word):
            tokens.append(word)
    seen: set[str] = set()
    unique: list[str] = []
    for token in tokens:
        key = _thousands(token).lower()
        if token and key not in seen:
            seen.add(key)
            unique.append(token)
    return unique


def _token_in(token: str, haystack: str) -> bool:
    """Whether a token occurs in haystack, as the kind of token it is (see hard_tokens).

    A number may be followed by a unit letter (1.25x, 1M), but not by another digit or a decimal.
    An identifier is a whole word; a hyphen in it matches a space too (supply-chain, supply chain).
    Anything else must start and end on a word boundary where it starts or ends with a letter.
    """
    text = _thousands(token).lower()
    if NUMBER_TOKEN.fullmatch(text):
        pattern = r"(?<![0-9.])" + re.escape(text) + r"(?![0-9]|\.[0-9])"
    elif _identifier_like(token):
        body = r"[-\s]".join(re.escape(part) for part in text.split("-"))
        pattern = r"(?<![a-z0-9_])" + body + r"(?![a-z0-9_])"
    else:
        pattern = re.escape(text)
        if text[0].isalnum() or text[0] == "_":
            pattern = r"(?<![a-z0-9_])" + pattern
        if text[-1].isalnum() or text[-1] == "_":
            pattern += r"(?![a-z0-9_])"
    return re.search(pattern, _thousands(haystack).lower()) is not None


FACT_CHIP = re.compile(r'<(a|span) class="fact-chip"[^>]*>.*?</\1>', re.DOTALL)


def _check_span_tokens(fact: Fact, markup: str, shown: str, line: int, report: Report) -> None:
    """A hard token the span states must appear in the fact's claim or quote (FACTS §6).

    The chip (its verified date and source host) is written from the registry, not stated by the
    span, so it is left out.
    """
    markup = FACT_CHIP.sub("", markup)
    if not markup.strip():
        return
    haystack = _thousands(f"{fact.claim} {fact.quote}").lower()
    snippet = _plain(markup)
    if len(snippet) > 80:
        snippet = snippet[:77] + "..."
    for token in hard_tokens(markup):
        if not _token_in(token, haystack):
            report.error(
                shown,
                line,
                f"span for '{fact.id}' says '{token}', in neither its claim nor its quote: "
                f"\"{snippet}\"",
            )


def _freshness_warnings(
    fact: Fact, today: dt.date, used: set[str], warn_days: int, report: Report
) -> None:
    age = fact.age_days(today)
    if age is None:
        return
    if fact.volatility != "volatile":
        return
    if age > FRESH_DAYS:
        if fact.id not in used:
            report.warn(
                fact.file,
                fact.line,
                f"volatile fact '{fact.id}' is stale ({age} days; limit {FRESH_DAYS}); "
                "not used by any page",
            )
        return
    if age > warn_days:
        report.warn(
            fact.file,
            fact.line,
            f"volatile fact '{fact.id}' is {age} days old (warn at {warn_days})",
        )


def _check_links(facts: list[Fact], fetch: Fetch, report: Report) -> None:
    cache: dict[str, str | None] = {}
    for fact in facts:
        for url in (fact.source, fact.source_alt):
            if url is None:
                continue
            if url not in cache:
                cache[url] = _link_error(url, fetch)
            error = cache[url]
            if error is None:
                continue
            message = f"source of '{fact.id}' failed: {url} ({error})"
            if fact.status == "verified":
                report.error(fact.file, fact.line, message)
            else:
                report.warn(fact.file, fact.line, message)


def _link_error(url: str, fetch: Fetch) -> str | None:
    try:
        status = fetch(url, "HEAD")
        if status in (403, 405):
            status = fetch(url, "GET")
    except OSError as exc:
        return f"network failure: {exc}"
    if status >= 400:
        return f"HTTP {status}"
    return None


def http_fetch(url: str, method: str) -> int:
    """Return the final HTTP status of ``url`` (redirects are followed)."""
    request = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=LINK_TIMEOUT) as response:
            return int(response.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def _parse_day(text: str) -> dt.date:
    try:
        return dt.date.fromisoformat(text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {text}") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the facts registry and page references.")
    parser.add_argument("--facts", type=Path, default=DEFAULT_FACTS, help="registry directory")
    parser.add_argument("--site", type=Path, default=DEFAULT_SITE, help="site directory")
    parser.add_argument(
        "--today", type=_parse_day, default=None, help="YYYY-MM-DD (default: today)"
    )
    parser.add_argument("--links", action="store_true", help="HTTP-check every source URL")
    parser.add_argument("--warn-days", type=int, default=DEFAULT_WARN_DAYS)
    args = parser.parse_args(argv)
    today = args.today or dt.date.today()
    report = run(args.facts, args.site, today, args.links, args.warn_days)
    for problem in report.problems:
        print(problem.render())
    print(report.last_line())
    return 1 if report.error_count() else 0


if __name__ == "__main__":
    raise SystemExit(main())
