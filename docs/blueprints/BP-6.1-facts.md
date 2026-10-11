# BRIEF BP-6.1-facts: the facts the audit found missing (caching, stop_reason)

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md`.
You edit only `facts/*.yaml`. Write one report to the path you are given.

The Phase 6 accuracy audit found glossary terms, card backs and page
sentences that state API behavior no fact covers. Add each fact below
**only if a primary source supports it**, with a verbatim quote fetched
today; tighten the claim to the quote. A page you cannot fetch makes the
fact `unverifiable` with a note; never a mirror, never a cache, never a
route around a denied host (D-052 and FACTS §4). Check the registry first:
if an existing fact already says it, report the id and add nothing.

| id (proposed) | Claim to check | Primary source | Used by |
|---|---|---|---|
| `api.cache-prefix-whole-match` | A cache hit needs the prompt identical up to the cache breakpoint (the docs' words for what must match). | platform.claude.com/docs/en/build-with-claude/prompt-caching | glossary cache-prefix, C4 |
| `api.cache-ttl-refresh-on-read` | Using a cached prefix refreshes its lifetime (the docs' words, and whether it costs anything). | the same page | glossary cache-ttl, C4 :131 |
| `api.cache-write-price-multiplier` | What a cache write costs relative to base input tokens, for the default lifetime (and for the 1-hour one, if the page says). | the same page, or the pricing page | glossary cache-write, C4 |
| `api.cache-read-price-multiplier` | What a cache read costs relative to base input tokens. | the same page, or the pricing page | glossary cache-read, cache-hit, C4 |
| `api.cache-output-unchanged` | Whether the docs say caching changes the model's output. Add a fact only if a sentence says so; otherwise report "not stated". | the same page | C4's misconception k2 |
| `api.stop-reason-field` | Every Messages API response carries a `stop_reason` field, and which values the docs list. | platform.claude.com/docs (handling stop reasons, or the Messages API reference) | glossary stop-reason, B2 and H1 cards |
| `api.error-400-invalid-request` and `api.error-500-api-error` | The 400 and 500 errors, with their error types and the docs' description. Check the existing api.error-* facts first. | platform.claude.com/docs/en/api/errors | T5 http-and-sse :121 and its checks |

## Acceptance
`.venv/bin/python tools/check_facts.py` passes; then `.venv/bin/python tools/gen_data.py`
(quote both final lines).

## Report
For each id: added / unverifiable / already covered (with the id) / not
stated, one line with the source URL. Then the checkers' final lines.
