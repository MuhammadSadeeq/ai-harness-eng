# BRIEF BP-3.0-facts: facts for B2 and waves 3.1–3.2

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md` (all).
You edit only `facts/*.yaml` (existing area files; no new areas) and write your
report to the path you are given.

Add each fact below **only if a primary source supports it**, with a verbatim
quote fetched today. Claims are the course's wording; tighten a claim to what
the quote says rather than stretching a quote. If a source can't be fetched or
doesn't support it, add it with `status: unverifiable` (or `contradicted`) and a
note; never guess. Use the Claude API docs (platform.claude.com/docs/…) as the
primary source for `api.*` facts; a raw/markdown rendering of the same page may
be `source_alt`.

| id (proposed) | Claim to check | Used by |
|---|---|---|
| `api.messages-stateless` | The Messages API is stateless: each request must include the conversation history the model should see. | A3, H1 |
| `api.content-multiple-blocks` | A response's `content` is a list of blocks and can hold more than one block, for example text followed by `tool_use`. | A4, H1, B2 |
| `api.temperature-range` | The `temperature` parameter's range and default. | A1 |
| `api.tool-use-without-result-error` | What the API does when an assistant `tool_use` is not answered by a `tool_result` in the next user message (the error type and, if the docs quote it, the message). | B2, C5 |
| `api.parallel-results-one-message` | What the docs say happens, or recommend, when results of parallel tool calls are sent in separate user messages instead of one. | B1 |
| `api.max-tokens-incomplete-tool-use` | What the docs say to do when `stop_reason` is `max_tokens` and the last block is an incomplete `tool_use`. | B2, A4 |
| `api.tool-result-ids-must-match` | Each `tool_result` must carry the `tool_use_id` of the call it answers. | B1, B2 |

Also re-check the existing `api.stop-reason-*` facts (`end-turn`, `tool-use`,
`max-tokens`, `stop-sequence`, `pause-turn`, `refusal`,
`model-context-window-exceeded`) and `papers.react-*`: fetch them again today,
update `verified_on` and the quote if the page changed, and mark any that no
longer hold `contradicted`.

## Acceptance
`.venv/bin/python tools/check_facts.py` passes (quote its final line).

## Report
For each id: added / re-verified / unverifiable / contradicted, one line with
the source URL. Then the checker's final lines.
