# BRIEF BP-3.3-facts: facts for ENGINE A6–A7 and waves 3.2–3.3

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md` (all).
You edit only `facts/*.yaml` (existing area files; no new areas) and write your
report to the path you are given.

Add each fact below **only if a primary source supports it**, with a verbatim
quote fetched today. Claims are the course's wording; tighten a claim to what
the quote says rather than stretching a quote. If a source can't be fetched or
doesn't support it, add it with `status: unverifiable` (or `contradicted`) and a
note; never guess, never use a mirror. Claude API docs
(platform.claude.com/docs/…) are the primary source for `api.*` and price
facts; Anthropic's engineering posts (anthropic.com/engineering/…) for
`anthropic.*`.

## New facts
| id (proposed) | Claim to check | Used by |
|---|---|---|
| `api.consecutive-turns-combined` | The Messages API combines consecutive `user` (or `assistant`) turns in a request into a single turn. | ENGINE A7.2, B1 |
| `api.split-results-teach-serial` | The parallel tool use docs say that formatting tool results incorrectly (for example one user message per result) "teaches" Claude to avoid parallel calls. Quote the troubleshooting text itself (today it sits only in the note of `api.parallel-results-one-message`). | A7.2, B1 |
| `api.thinking-billed-as-output` | Thinking tokens are billed as output tokens. | A6 (course module), A7.3 |
| `api.cache-control-top-level` | What the docs say a top-level `cache_control` on the request does (automatic caching: where the breakpoint goes). | C4 |
| `api.cache-usage-fields` | A response's `usage` reports `cache_creation_input_tokens` and `cache_read_input_tokens`, and `input_tokens` counts only the tokens after the last breakpoint (or what the docs say it counts). | C4, A6.5 |
| `api.cache-read-refreshes-ttl` | Reading a cached prefix refreshes its time to live (or what the docs say about refresh). | A6.5 |
| `api.system-prompt-role` | What the docs say the system prompt is for (role, instructions, context), with the docs' wording. | C1 |
| `api.tool-results-are-data` (or the docs' nearest statement) | What Anthropic's docs or engineering posts say about treating tool results or retrieved content as untrusted data, not instructions (prompt injection). | C1, E1 |

## Values on existing price facts
For every `models.*-price` fact (Sonnet 5.5, Opus 5.5, Fable 5.1, and the two
Haiku 5.5 tiers): if the pricing page's table quotes the 5-minute cache write
price, add `cache_write_usd_per_mtok` to the fact's `value` and extend its
quote to include it. If the page has no per-model write price, report that
(A6.5 then computes it from `models.cache-write-5m-multiplier`, which then
needs a `value: {multiplier_percent: 125}` backed by its quote: add that too).

## Re-check
`models.cache-min-512-tokens`, `api.cache-ttl-default-5m-and-1h`,
`api.cache-invalidation-hierarchy`, `api.error-429-retry-after`,
`api.error-529-overloaded`, `anthropic.ctx-context-rot`: fetch again, update
`verified_on` and the quote if the page changed, mark any that no longer hold
`contradicted`.

## Acceptance
`.venv/bin/python tools/check_facts.py` passes (quote its final line), then
`.venv/bin/python tools/gen_data.py` and quote its final line.

## Report
For each id: added / re-verified / unverifiable / contradicted, one line with
the source URL. The price values added, per fact. Then the checker's final
lines.
