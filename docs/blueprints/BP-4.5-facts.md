# BRIEF BP-4.5-facts: setup, live-model and postmortem facts (H0, H7, H12, G1)

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md`.
You edit only `facts/*.yaml`. Write one report to the path you are given.

Add each fact **only if a primary source supports it**, with a verbatim
quote fetched today; tighten the claim to the quote. A page you cannot fetch
makes the fact `unverifiable` with a note; never a mirror, never a cache, and
never a route around a denied host (D-052; also denied today: rfc-editor.org,
whatwg.org, docs.pytest.org, docs.docker.com, git-scm.com, simonwillison.net).
A vendor's own repository on github.com is a primary source for its SDK:
name the tag or commit you read.

**Ruling on headings:** a heading is verbatim text on the page, so it can be
a quote. Quote it exactly as the page shows it, numbering included if the
page numbers it.

| id (proposed) | Claim to check | Primary source | Used by |
|---|---|---|---|
| `anthropic.postmortem-2025-causes` | The three bugs, by the post's headings. | anthropic.com/engineering/a-postmortem-of-three-recent-issues | G1.o3 |
| `api.sdk-env-api-key` | The Python SDK reads the API key from the `ANTHROPIC_API_KEY` environment variable when none is passed. | github.com/anthropics/anthropic-sdk-python (README or client source, at a tag) | H0.o4, H12 |
| `api.console-api-keys` | API keys are created in the Claude Console (name the page or path the docs give). | platform.claude.com/docs (get started / API overview) | H0.o4 |
| `api.models-list` | The Models API lists the models available to a key (`GET /v1/models`); say what one entry carries, in the docs' words. | platform.claude.com/docs (Models API reference) | H12 (checking a key and a model id before a live run) |
| `api.thinking-blocks-preserve` | With tool use and thinking, the thinking blocks of the last assistant turn are passed back unchanged (in the docs' words). | platform.claude.com/docs/en/build-with-claude/extended-thinking (or the thinking page) | A4, H12 |
| `api.retry-after-header` | A 429 response carries a `retry-after` header (in seconds), as the errors or rate-limit page says. Check `api.error-429-retry-after` first: if it already says this, report it and add nothing. | platform.claude.com/docs (errors, rate limits) | H7 |
| `api.sdk-max-retries-option` | The Python SDK's retry count is set with a `max_retries` option (on the client or per request), and its default. Check `api.error-sdk-retries` first and add only what it lacks. | github.com/anthropics/anthropic-sdk-python (README, at a tag) | H7 |

## Acceptance
`.venv/bin/python tools/check_facts.py` passes; then `.venv/bin/python tools/gen_data.py`
(quote both final lines).

## Report
For each id: added / unverifiable / contradicted / already covered, one line
with the source URL (and the tag or commit for repositories). Then the
checkers' final lines.
