# BRIEF BP-3.2-facts: facts for waves 3.2 and 3.3 (A4, B3, T4–T7, C-modules)

Fact-checker rules: `.claude/agents/hx-factchecker.md` and `docs/FACTS.md`
(all; the areas `jsonschema`, `web`, `pytest`, `docker` and `git` are new,
D-055). You edit only `facts/*.yaml` (a new file per new area). Write your
report to the path you are given.

Add each fact **only if a primary source supports it**, with a verbatim quote
fetched today; tighten the claim to the quote. A page you cannot fetch makes
the fact `unverifiable` with a note; never a mirror, never a cache, and never
a route around a denied host.

| id (proposed) | Claim to check | Primary source | Used by |
|---|---|---|---|
| `api.usage-input-output-tokens` | Each Messages API response carries `usage` with `input_tokens` and `output_tokens`. | platform.claude.com docs (Messages API reference) | A4 |
| `api.streaming-event-types` | A streamed response is a sequence of events: `message_start`, then for each content block `content_block_start`, `content_block_delta` events and `content_block_stop`, then `message_delta` and `message_stop`. | platform.claude.com docs (streaming) | A4.o5, T5 |
| `api.error-401-authentication` | HTTP 401 is `authentication_error`: a problem with the API key. | platform.claude.com docs (errors) | T5.o2 |
| `jsonschema.required` | `required` lists the properties an object must have. | json-schema.org (specification or Understanding JSON Schema) | T4, A5 |
| `jsonschema.additional-properties-false` | `additionalProperties: false` makes properties not listed in `properties` invalid. | json-schema.org | T4, A5 |
| `jsonschema.enum` | `enum` restricts a value to a fixed set. | json-schema.org | T4, C7 |
| `jsonschema.type` | `type` restricts a value's type (string, number, integer, object, array, boolean, null). | json-schema.org | T4 |
| `web.http-request-response` | An HTTP request has a method, a target, headers and an optional body; a response has a status code, headers and an optional body. | rfc-editor.org (RFC 9110) | T5.o1 |
| `web.sse-format` | A server-sent event stream is text: each event is lines of `field: value` (such as `event:` and `data:`), and a blank line ends the event. | html.spec.whatwg.org (server-sent events) | T5 |
| `pytest.fixtures` | A fixture is a function marked `@pytest.fixture`; a test asks for it by naming it as an argument. | docs.pytest.org | T6 |
| `pytest.parametrize` | `@pytest.mark.parametrize` runs a test once for each set of arguments. | docs.pytest.org | T6 |
| `docker.network-none` | `--network none` runs a container with no network access beyond loopback. | docs.docker.com | T7, C10 |
| `docker.read-only` | `--read-only` mounts the container's root filesystem read-only. | docs.docker.com | T7 |
| `docker.bind-mount` | `-v` / `--mount type=bind` mounts a host directory into the container. | docs.docker.com | T7 |
| `docker.shares-host-kernel` | Containers share the host's kernel (unlike virtual machines). | docs.docker.com | T7.o1, C10.o5 |
| `git.restore`, `git.revert`, `git.worktree` | What `git restore`, `git revert` and `git worktree add` do, in the manual's words. | git-scm.com/docs | T8 |
| `git.diff-format` | The unified diff format `git diff` prints: the `---`/`+++` file lines, `@@` hunk lines, and `-`/`+` line marks. | git-scm.com/docs | T8.o1 |
| `harnesses.claude-code-os-sandbox` | Claude Code's sandbox uses the operating system's own isolation (name the mechanisms the source names) to limit file and network access. | anthropic.com/engineering or code.claude.com docs | C10.o5 |
| `docker.vm-difference` | What Docker's docs say separates a container from a virtual machine (the shared kernel, the weight). | docs.docker.com | C10.o5, T7 |
| `anthropic.harness-changes-move-results` | An Anthropic engineering post states that changes to the harness or scaffold, with the same model, change agent results (quote the sentence and the numbers if any). | anthropic.com/engineering | B3.o5 |
| `anthropic.harness-counterpoint` | A primary source that states a limit: a stronger model needs less scaffolding, or scaffolding gains shrink as models improve. | anthropic.com/engineering, or a vendor's model page | B3.o5 |

## Acceptance
`.venv/bin/python tools/check_facts.py` passes; then `.venv/bin/python tools/gen_data.py`
(quote both final lines).

## Report
For each id: added / unverifiable / contradicted, one line with the source
URL. Then the checkers' final lines.
