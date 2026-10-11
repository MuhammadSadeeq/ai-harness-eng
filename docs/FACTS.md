# HARNESSED: facts policy

Status: v1 (Phase 0). Enforced by `tools/check_facts.py` and the scheduled
`facts-freshness` workflow.

**Rule:** a claim, snippet or number that no checker covers is a bug. Facts
are the checker for everything that comes from outside the course.

---

## 1. What needs a fact

A registry entry is required for any claim about:

- a vendor's product, API shape, parameter, model ID, default, limit or price;
- a version, release, date or deprecation;
- a standard or specification (MCP, OpenTelemetry, OWASP, JSON Schema, …);
- a number reported by a company or a paper ("cut prompts by 84 %");
- a quotation, a definition attributed to someone, or "X introduced Y".

No fact is needed for the course's own explanations and principles ("jitter
spreads retries out"), for numbers produced by the course's own simulator
(those come from components), or for plain arithmetic.

**Teach principles separately from parameter names.** The principle ("a
cut-off reply must not be trusted as a tool call") is course text; the current
name of the stop reason is a fact. When the API changes, only the fact changes.

## 2. Registry format

One YAML file per area under `facts/`; the file stem is the id prefix.
Areas: `api` (Claude API and SDK behavior), `models` (model IDs, limits,
prices), `harnesses` (Claude Code, Codex, open harnesses, managed agents),
`mcp`, `otel`, `owasp`, `skills`, `agentsmd`, `a2a`, `aaif` (standards and
their stewards), `anthropic` and `openai` (the vendors' engineering and
research posts), `security`, `evals`, `papers`, `careers`, `python` (the
language and its standard library, from docs.python.org; D-052), and for the
primers `jsonschema` (json-schema.org), `web` (HTTP and server-sent events:
the RFCs and the WHATWG HTML standard), `pytest` (docs.pytest.org),
`docker` (docs.docker.com) and `git` (git-scm.com) (D-055). A new area needs a director decision.

```yaml
- id: api.parallel-tool-results          # <area>.<kebab-case>, unique, never reused
  claim: "All tool_result blocks answering one assistant turn go back in a single user message."
  source: https://platform.claude.com/docs/en/…   # canonical primary URL (final URL after redirects)
  source_alt: https://…   # optional: the same text elsewhere (raw/markdown rendering, or a repo file at a pinned commit)
  quote: "<exact sentence(s) from the source, verbatim>"
  verified_on: 2026-10-10
  volatility: volatile                   # volatile | stable
  status: verified                       # verified | unverifiable | contradicted (default verified)
  kind: company-report                   # optional: company-report | paper | spec | docs
  value: {input_usd_per_mtok: 4, output_usd_per_mtok: 20}   # optional machine-readable value
  note: "…"                              # optional; required when status is not verified
```

- `quote` is verbatim, copied from the source as fetched on `verified_on`.
  The claim says no more than the quote supports.
- `value` is what components read (prices for `hx-costcalc`, limits for the
  simulator). A component never hard-codes a vendor number.
- `volatile` = can change without notice (APIs, prices, model lists, product
  features, job market). `stable` = fixed (a paper's title, a dated
  historical statement, a spec revision's content).

## 3. Sources

- **Primary only:** vendor documentation, release notes and changelogs;
  specifications and their official repositories; papers; the authors' own
  posts. A summary of someone else's work is not a source.
- **Company numbers** are labeled `kind: company-report` and written as the
  company's own report in the page ("Anthropic reported…").
- **Repositories as sources.** When a spec's rendered site can't be reached
  but its official repository can, quote the repository file at a pinned
  commit. If the quote contains Markdown or code that the rendered page
  doesn't show verbatim, the pinned repo file *is* the `source`; otherwise
  keep the rendered URL in `source` and the repo file in `source_alt`. The
  authors' own repository (for example a paper's code and BibTeX) counts as
  a primary source. Re-check against the rendered page when it becomes
  reachable.
- **Numbering that moves.** When a source's own numbering is unsettled (for
  example OWASP's 2026 list, whose README and working files disagree as of
  2026-10-10), the course names items by title and shows a number only with
  its own verified fact.

## 4. Status rules

- Pages may only reference facts with `status: verified`.
- `unverifiable`: the source couldn't be fetched or doesn't support the
  claim. Kept so the work isn't lost; never shown to learners.
- `contradicted`: the source says something else. `note` proposes the
  corrected claim; the director decides.
- Some primary hosts are blocked by the build environment's egress policy
  (as of 2026-10-10: arxiv.org, openai.com, developers.openai.com,
  simonwillison.net, modelcontextprotocol.io, opentelemetry.io,
  genai.owasp.org, agentskills.io, agents.md, a2a-protocol.org,
  linuxfoundation.org, cdn.jsdelivr.net, unpkg.com). Facts that depend on them
  stay `unverifiable` until the owner allows the host or supplies the text.
  Fact-checkers never route around a block or use a mirror.

## 5. Freshness

- A `volatile` fact must have `verified_on` within **90 days**, or
  `check_facts.py` fails for pages that use it (and warns for unused ones).
- The weekly `facts-freshness` workflow re-checks: dates older than 75 days
  (early warning), dead or redirected source links, and quotes that no longer
  appear on the page (best effort, since some pages render client-side).
- `stable` facts are link-checked but don't expire.

## 6. In the page

```html
<span class="fact" data-fact="api.parallel-tool-results">…claim…</span>
```

`app.js` appends the chip: `check · verified Oct 2026 · ext`, linking to
`source` (stale facts show `bang · check source`). Company reports add
`· company report`. `site/data/facts.json` is generated from `facts/*.yaml` by
`tools/gen_data.py`, so pages never contain dates or URLs typed by hand.

`check_facts` also checks each span's hard tokens: every number, `code`
token, quoted string and identifier-like word (a hyphen, an underscore, a
digit, a dot between letters, or CamelCase) must appear in the fact's claim
or quote. A span that keeps the claim's tokens but changes their meaning
(which value is the default, say) passes the checker; the audit's span pass
and review catch that. A term's or a card's `fact:` is checked for its id and
status (check_content B10), not yet for its tokens.

## 7. Workflow

1. A builder needs a claim → lists it under "Missing facts" in the report.
2. The director batches missing facts into a fact-checker brief.
3. The fact-checker (`.claude/agents/hx-factchecker.md`) edits only
   `facts/*.yaml`, fetches each source today, quotes it exactly, and runs
   `python tools/check_facts.py`.
4. The director spot-checks about 10 % of new or changed facts against the
   source before accepting the wave, and records the sample in the commit
   message.
