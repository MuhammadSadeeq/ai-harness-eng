# BLUEPRINT BP-3.2-content: wave 3.2 modules A4, A5, A6, A7, B1, B3, B4, T4–T6

Phase 3, wave 3.2 content. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. Same rules as BP-3.1-content (read its "Rules for this wave"; they
all apply), plus what wave 3.1 taught, below.

## Read first (everyone)
`docs/AUTHORING.md` v1 (all; §13 is the checklist), the B2 page and one wave 3.1
page of your kind (core: `the-stateless-model.html`; concept:
`what-a-model-does.html`; primer: `py-typing-and-dataclasses.html`), the
walkthrough reports in `docs/gate/`, `course.json` (your modules: kind,
objectives, terms, family, law, prerequisites, interactions), `docs/ENGINE.md`
(A5 and A7 for the bug and feature modules your tapes use), `docs/COMPONENTS.md`,
and DECISIONS D-049 to D-052.

## Lessons from wave 3.1 (binding)
- A Break incident or replay is a figure: `figure > hx-… (fallback inside) + figcaption`.
- A lab's module data goes in `content/<ID>/labs/<name>.json` (served at
  `../data/labs/<ID>/<name>.json`); never point a module at a demo file.
- A replay or incident on a tape with several seeds names the seed that shows
  the failure (`seed="1"`), and the predict outcome must match what that seed shows.
- Every objective needs an assessment item of its own; the header list does
  not count (check_content B4 now enforces it).
- Python behavior: show it with a checked snippet (D-052); a claim a snippet
  can't show needs a verified fact; `python.*` facts are unverifiable for now
  (their host is denied), so don't state those claims.
- Prose: aim 500–850 words; every term defined at first use or linked.

## Who writes what
| Builder | Modules | Incident tapes | Labs and katas |
|---|---|---|---|
| JS builder | A4 (core), A5 (core), A7 (concept) | A4 reuses `h1-first-block` (the same bug; A4 is the theory, H1 the build); new `a5-schema-drift` (`validate_inputs` off on `a5-old`: a wrong-shaped input wipes a file; on `a5-new` the check returns a fixable error and the model corrects it); new `a7-long-chain` (a long task where each step can slip, branches at a set percent; the new board's verify gate catches the slip) | `hx-wire`, `hx-replay`, `hx-bench`; kata `A4-parse` (read every block and stop reason); kata `A5-validate`; `hx-dice` (A7) |
| Bench builder | A6 (concept), B3 (concept), B4 (concept) | new `a6-effort` (ENGINE A7.3: max effort on easy work, the same answers at many times the cost and wait; the new board sets a fitting level); new `b3-regression` (a harness change, not the model, makes results worse: for example an output cap so small it cuts the line the model needs); B4 reuses `s0-false-done`, now asking which wire is at fault | `hx-costcalc` (A6), `hx-sort` (B3, B4), `hx-clock` (B4: the Turn Clock), `hx-check` |
| Rein builder | B1 (core), T4, T5, T6 (primers) | new `b1-split` (`split_results` on `b1-old`: the model, seeing split results, stops calling tools in parallel, so runs take more turns and cost more; `results_split` condition, ENGINE A7.2; `b1-new` sends one message) | `hx-workbench` (B1: a tool is a UI for a model), kata `B1-results` (match ids, one message, is_error); katas `T4-schema`, `T5-sse` (parse an SSE stream from text: no network in the browser), `T6-fixtures` |

Facts: list every product claim you need with its likely primary source in
your report; the fact-checker runs after the wave. The API facts on streaming
(A4.o5), structured outputs (A5), effort and thinking (A6), and tool use (B1)
mostly exist; check `facts/api.yaml` first. B3.o5 needs evidence that harness
changes alone move results, and one counterpoint: name candidate sources
(engineering posts, benchmark pages), don't write the claim without a fact.

## Acceptance (quote final lines)
As BP-3.1-content, for your pages and tapes. Report each tape's run_end lines
(JS; I write goldens after parity).

## Report
Per module: files; checks and final lines; word counts per beat; facts used
and needed; tapes with run_end lines; deviations; open doubts. Don't commit.
