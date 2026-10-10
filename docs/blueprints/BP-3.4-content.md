# BLUEPRINT BP-3.4-content: wave 3.4 modules C7–C12, T8

Phase 3, wave 3.4 content. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. The rules and lessons of BP-3.1, BP-3.2 and BP-3.3 content all
apply (read their "Rules for this wave" and "Lessons" sections); so does
everything below.

## Read first (everyone)
`docs/AUTHORING.md` v1 (§13 is the checklist), the B2 page (the bar), one
accepted page of your kind from waves 3.1–3.3, the walkthrough reports in
`docs/gate/`, `course.json` (your modules), `docs/ENGINE.md` §7.5–§7.7 and
amendments A4, A9, A10 (the features your tapes use: `tool_overrides`,
`tool_search`, tape `tests` with `pristine_tests`, `cost_attribution`,
`sandbox` with links and `outside`, `redact`), `docs/COMPONENTS.md`, DECISIONS
D-049 to D-055, and the demo page and data contract of each lab you use (all
accepted and registered). The engine tapes `scenarios/engine/eng-overrides`,
`eng-search`, `eng-tamper` and `eng-cost` show each feature working; your
incident tapes are new, written for the module.

## Who writes what
| Builder | Modules | Incident tapes | Labs and katas |
|---|---|---|---|
| JS builder | C7 (core), C8 (core), C12 (core) | new `c7-tool-confusion` (`tool_overrides` on `c7-new` gives the tool a clear description and an enum; on `c7-old` the vague definition, and `sent_lacks:` makes the scripted model misuse it); new `c8-tool-overload` (many tool definitions: `c8-old` sends them all and the scripted model slips as `tools_gte:` rises; `c8-new` plugs `tool_search`); new `c12-unexplained-bill` (`cost_attribution` on both boards; the old run's cost is dominated by one part, found in the trace; `redact` on `c12-new` for C12.o4) | `hx-workbench` and `hx-scheduler` (C7), `hx-bench`, `hx-wire` (C8: the request's tools), `hx-replay` (C12: find the costly part); katas `C7-errors` (results and errors that say what to do next), `C8-search` (load tools by keyword, A9.2), `C12-spans` (turn a list of events into run, turn, model call and tool call spans) |
| Bench builder | C9 (core), C11 (core) | C9 reuses `c9-approval` (incident exists); new `c11-tamper` (tape `tests`: on `c11-old` the model deletes a test marker and the gate passes a false done; `c11-new` sets `pristine_tests`) | `hx-gatekeeper` (C9), `hx-bugcatch` (C11); katas `C9-policy` (a policy as code tested with a table of cases, decision order deny, ask, allow, default), `C11-gate` (a verification gate that reruns the original tests) |
| Rein builder | C10 (core), T8 (primer) | new `c10-escape` (a symlink and a `../` path reach `outside`, where a planted secret sits; `c10-new` plugs `sandbox` with an egress allow-list and `redact`) | kata `C10-confine` (resolve a path against a workspace root, following links, and refuse an escape); T8 kata `T8-diff` (read a unified diff into the files and lines it changes, tested against fixtures; git commands shown in a plain block marked `Runs on your machine, not in the browser.`) |

## Notes per module
- **C7**: the six rules from the course's tool chapter, each tied to a
  workbench rule; annotations (C7.o4) cite the `mcp.annotation-*` facts and
  say they are hints; the scheduler covers C7.o5.
- **C8**: MCP's shape (hosts, clients, servers, transports, primitives) and
  skills each need facts (`mcp.yaml`, `skills.yaml`; check them first).
  Programmatic tool calling (C8.o4) needs an API fact; until it is verified,
  explain the idea without product claims. Vetting a server (C8.o5) points
  ahead to E2 (pinned servers).
- **C9**: risk as action × target; the gatekeeper's two rounds; the tie is
  the lesson (D-053). Product permission modes need facts (list them).
- **C10**: the blast wall holds whatever permissions said; OS sandboxes,
  containers and virtual machines compared in one table, whose rows need
  facts or are labelled as the course's comparison.
- **C11**: guides and sensors (C11.o3) through `hx-bugcatch`; the
  independent reviewer (C11.o4) is a principle with a check item.
- **C12**: the OpenTelemetry GenAI conventions (C12.o3) need `otel.*` facts;
  the spans kata is the course's own structure, labelled as such.
- **T8**: small commits, restore and revert, branch and worktree; command
  behaviour needs facts from git's own documentation (area `git`,
  git-scm.com; list them).

## Facts
List every product claim with its likely primary source in your report.
Check `facts/*.yaml` first. The fact-checker runs after the wave.

## Acceptance (quote final lines)
As the earlier content blueprints: check_content on your pages, check_facts,
check_snippets, check_katas `--pyodide`, check_scenarios (new tapes: parity, no
goldens yet), QA `--only` your pages at 0 failures with self-tests counted,
every figure viewed at 375 and 1280 in both themes. Run `gen_data.py` and
`gen_pages.py` and say so.

## Report
Per module: files; checks and final lines; words per beat; facts used and
needed; tapes with run_end lines per board and seed; deviations; open
doubts. Don't commit.
