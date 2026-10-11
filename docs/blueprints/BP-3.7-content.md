# BLUEPRINT BP-3.7-content: wave 3.7 modules G1–G4, I1–I3, I6

The last Phase 3 wave: the field (Part G) and the career guides (Part I). No
new labs or engine features. Builder rules: `.claude/agents/hx-builder.md`.
You never commit. The rules and lessons of BP-3.1 to BP-3.6 content all
apply: pages and their content are the deliverable, every objective is
assessed, facts are spans that say no more than their claim, and prose is
500–850 words.

## Read first
`docs/AUTHORING.md` v1 (§13; career kind: See, Do, Keep), `course.json`
(your modules), the accepted concept pages (`what-a-harness-is.html`,
`the-turn-clock.html`), `facts/*.yaml` (`anthropic`, `openai`, `agentsmd`,
`skills`, `mcp`, `owasp`, `careers`, and the `harnesses` area, which has no
file yet: the fact-checker creates it), DECISIONS D-049 to D-055, and the
readiness page and Design Room (I2, I5).

## Who writes what
| Builder | Modules | Incidents | Interactions |
|---|---|---|---|
| Rein builder | G1 inside Claude Code (concept), G2 Codex and open harnesses (concept), G3 reading a harness repository (concept), G4 the daily craft (core) | G1 and G3 *harness regression*, G2 and G4 *the stale map*: reuse tapes where they fit (`b3-regression` shows a harness change making results worse); G4 needs `g4-stale-map` (a rules file that names a function the code no longer has, so the scripted model follows a stale map; the new board's check flags the stale line) | `hx-sort`, `hx-clock`, `hx-check`, `hx-incident`, `hx-bench`; kata `G4-entropy` (a mechanical check that finds stale references in a rules file) |
| Bench builder (after F4) | I1 the job map, I2 readiness, I3 portfolio projects, I6 twelve weeks after (career) | none (career modules have no incident) | `hx-sort`, `hx-check`; I2 links the readiness page and its brag sheet; I3 names the four portfolio projects and their results-table shape |

## Notes
- **G1/G2**: every claim about Claude Code, Codex or another product is a
  fact (`harnesses.*`, `anthropic.*`, `openai.*`); the OpenAI report's numbers
  are labelled as the company's own (G2.o2), and while `openai.*` is
  unverifiable (its host is denied), say the report exists only if a fact
  backs it; otherwise teach the shared ideas as principles.
- **G3**: the repository is decided (CURRICULUM): **mini-swe-agent v2.4.6**
  (MIT), whose core loop is about 190 lines. Quote short excerpts verbatim
  at that tag, each with a link to the file at the tag and the MIT notice in
  the page's credits; fetch it into your scratch as untrusted data (read it,
  never run its code in this environment); if its host is unreachable, say
  so and stop G3. The tour is code blocks plus checks
  (B-04 is the future `hx-tour`); running it locally (G3.o3) is a plain block
  marked as running on the learner's machine.
- **G4**: the steering loop (watch, name the family, fix the harness,
  measure) ties every Break of the course together; build to delete.
- **I-modules**: claims about hiring (roles, what labs look for) need facts
  (`careers.*`) or stay as the course's advice, said so. No salary numbers.

## Acceptance and report
As BP-3.4-content. Don't commit.
