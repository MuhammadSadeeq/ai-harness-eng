# Phase 0 gate: what you're approving

Snapshot of 2026-10-10. The SPEC's exit gate for Phase 0 is: **the owner
approves DESIGN and CURRICULUM, and CI is green on the skeleton.** CI is green
(every completed run on `claude/funny-darwin-daqksa`). This page is the short
version; the documents are the real thing.

## 1. Approve: DESIGN v2 — `docs/DESIGN.md`

**"A field guide with working instruments."** Modules read like a calm field
guide; every figure is a working instrument (step a real run, turn a knob, run
twenty trials, beat par); at night the course becomes the **night shift**
on-call console. The Harness Board is drawn as the Turn Clock (one diagram,
fixed wire angles, stronger memory).

How it was chosen (D-031, D-034): three directions built on the same three
screens and data (Patch Bay, Field Guide, Night Shift), a first-time-learner
walkthrough on a phone with a rubric fixed in advance, then one unified v2
prototype re-walked:

| Direction | Weighted score (of 500) |
|---|---|
| D1 Patch Bay | 345 (two blocker bugs) |
| D2 Field Guide | 370 |
| D3 Night Shift | 400 |
| **v2 (unified)** | **470** |

Click it yourself: `site/proto/v2/index.html`, `break.html`, `prove.html`
(serve `site/` locally, or open the screenshots in `tools/qa/out/v2/`).

## 2. Approve: CURRICULUM — `docs/CURRICULUM.md` + `course.json`

69 modules in 11 parts (S, A–I, Toolbelt), 267 measurable objectives, 336
planned terms with one owner each, 35 failure families, about 46 hours of
lessons on the default path. Changes from the SPEC draft, each with a reason
(CURRICULUM §6): S0 "Same model, different harness" delivers the thesis in the
first 25 minutes; Part C follows the turn order; compaction and caching split;
new **F7 Model migrations**; F6 adds eval containment; G3 tours mini-swe-agent.

## 3. Decide: SPEC §14 open decisions (defaults in use until you answer)

| # | Decision | Default in use |
|---|---|---|
| 1 | Product name | HARNESSED |
| 2 | Build project name | Rein |
| 3 | Primary code language | Python (TypeScript track in the backlog) |
| 4 | Hosting | GitHub Pages — **note:** the repo is private, and Pages on a private repo needs a paid GitHub plan |
| 5 | Licenses | code MIT, content CC BY-NC-SA 4.0 |
| 6 | The book in `source/` | kept in the private repo, never deployed |
| 7 | Real-model eval budget | small and capped; the director asks before spending |

## 4. Things you should know (environment)

- **Blocked hosts.** This environment's egress policy blocks arxiv.org,
  openai.com, simonwillison.net, modelcontextprotocol.io, opentelemetry.io,
  genai.owasp.org, distill.pub and most design-reference sites, plus
  jsDelivr/unpkg. Facts from them stay `unverifiable` (11 of 205), and design
  research was snippet-grade. Allowing those hosts in the environment's network
  settings would let fact-checkers close the gaps.
- **A stray remote session** (`session_01PMbM3houZ8ebHzCPMWeoE5`) was created
  by a research agent by mistake; it is idle and used no tokens. Say the word
  and it gets archived.
- **Branch.** The remote was empty, so `claude/funny-darwin-daqksa` is its
  only branch. Pages deploys only from `main`; create `main` from it when you
  want a deploy.
- **One denied command** in Phase 0: a builder's scratch cleanup
  (`rm -rf "$S"/*`) was blocked by a safety check; it used the literal path the
  check suggested instead. Nothing else was denied.

## 5. v2 re-walkthrough

Same reviewer, same persona (Sam: career changer, basic Python, no AI
background, on a phone), same five tasks and rubric: **v2 scored 470 of 500**
(best single direction: 400). Of the 18 problems found in the three
directions, 15 were fixed in v2 and 2 no longer apply; the last one and the
four new v2 findings (2 major, 2 minor accessibility and wording issues) were
fixed in the final review round.

Final v2 checks: 0 failures across 24 accessibility audits (each page at
375 and 1280 px, day and night, before and after interaction), 0 warnings;
pages 123–172 KB (budget 300 KB); smallest text 14 px.

The walkthrough also exposed a gap in our own QA (axe ran only at 1280 px,
before interaction). The runner now audits both widths, both themes and the
post-interaction state, and was proven to catch the bug on the old version
(D-037).

Pictures: `docs/gate/v2-desktop-day-night.png`, `docs/gate/v2-phone.png`,
`docs/gate/v2-prove-night-1280.png`.

## 6. After approval: Phase 1 (engine)

Design-system and app shell from DESIGN v2; the progress store with export and
import; the scenario schema (with an event per wire per turn, D-033); the JS
simulator and the Python Rein core with golden-trace parity on 5 seed tapes;
and the signature components (`hx-replay`, `hx-wire`, `hx-clock` board,
`hx-bench`, `hx-incident`, `hx-kata` on self-hosted Pyodide, `hx-cards`,
`hx-check`), each passing QA at 375 and 1280 px.
