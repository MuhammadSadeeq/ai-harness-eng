# BRIEF BP-3.9: Phase 3 gate walkthrough (the content waves)

Reviewer rules: `.claude/agents/hx-reviewer.md`. You never edit project files;
you write only the report file you are given. Screenshots and scripts go in
the scratch path you are given (never under `tools/qa/` or `site/`).

Phase 3 built some fifty modules from the B2 bar. This walk checks that the
bar held across the waves, and that the course hangs together as one path:
a learner who follows it meets every term before it is used, every number
on screen is true, and nothing breaks between modules.

## Read first
`docs/AUTHORING.md` (all, §13 above all), `docs/PHASE2-GATE.md` and
`docs/gate/phase2-walkthrough-B2.md` (how the B2 walk was judged and
scored), `course.json` (`path`, parts, modules, prerequisites),
`docs/blueprints/BP-2.6-walkthrough.md`'s task list (the same per-module tasks apply),
and each sampled module's page, `content/<ID>/*.yaml`, tapes and katas.

## Persona
Sam, as in BP-2.6: basic Python, has used a chatbot, has never built an
agent. Sam arrives at each sampled module having done its prerequisites.

## Part 1: seven modules, walked in full
One per part: **A4** the API call on the wire, **C3** compaction and
memory, **C9** permissions, **D2** statistics for a random system, **F2**
long-running agents, **G4** the daily craft, and one primer, **T6** pytest.
For each, the six BP-2.6 tasks (Break, See, Fix, Prove, Keep, progress and
way-finding) in two passes: `m375` (touch, 375 × 812) and `k1280`
(keyboard only, 1280 × 900). Real taps, clicks and keys; never call
`__test` hooks. Score each module on the B2 rubric (out of 500) and say
what separates it from B2's 400.

## Part 2: the course as one path
Without walking every page in full, check across all built modules:
- **Sequencing:** a term used before the module that teaches it (follow the
  path order); a module whose Break assumes a prerequisite it does not list.
- **Consistency:** the same idea named two ways in two modules; a law that
  contradicts another module's law; a family named differently in a page
  and in `course.json`.
- **Numbers:** in five benches you pick across parts, every number in the
  prose is bound (`hx-num`) or matches the bench on screen.
- **Way-finding:** the home page's Continue target, the course map's "soon"
  marks (only unbuilt modules), the readiness page and the glossary after
  working through two modules (what moved, what did not).
- **Truth:** ten fact spans you pick across parts: each says no more than
  its fact's claim.

## Report
Severity per finding (blocker, major, minor), with the module, the step to
reproduce, and the evidence (a screenshot path or the exact text). Then the
seven scores with one line each on what separates the module from B2, and
a short list of what the next waves (Phase 4 steps, Phase 5 career pages)
should keep or avoid.
