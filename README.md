# HARNESSED

An interactive course that takes you from zero to a hireable AI harness
engineer: the person who builds the loop, the tools, the limits and the checks
around a model, so that an agent does real work and you can prove it did.

<!-- BEGIN GENERATED: counts -->
- 70 modules in 11 parts, 271 objectives, 35 failure families, about 46 hours of lessons on the default path.
<!-- END GENERATED -->

## What you learn

Every agent failure lands on one of the eight wires of a harness, and the course
is built around them: **control plane**, **context and memory**, **loop and
state**, **errors and recovery**, **tools**, **permissions and sandbox**,
**verification and evals**, and **observability**.

The parts, in order: **Start here**, **The model**, **From chatbot to agent**,
**The eight wires**, **Measure**, **Secure**, **Scale**, **Real harnesses**,
**Build Rein**, **Get hired**, and a **Toolbelt** of primers you take when a
module needs them.

Along the way you build **Rein**, a small agent harness of your own, one step at
a time in the browser and then as a local Python package with tests, an eval
runner and a real-model adapter. The last part is the career track: an Interview
Room with timed say-it prompts, a Design Room, from-memory katas, portfolio
project templates, a readiness radar and a brag sheet, and an optional capstone
that rebuilds Rein in Rust and proves it against the same golden traces.

## How a module works

Each module has five beats: a short **Break** (watch a run go wrong and predict
why), **See** (the idea, with the terms you need), **Fix**, **Prove** (run an
experiment and read the numbers) and **Keep** (cards, say-it prompts and a kata
you write again from memory). Incidents ask you to find where a run failed and
which wire to fix. A daily **on-call shift** mixes an incident, the cards that
are due and a drill from the modules you have started.

Everything runs in your browser: the simulator, the replays, the benches and
Python (Pyodide) for the katas. The course never asks for an API key, and no
page sends one anywhere. Your progress stays in your browser; **Export progress**,
at the foot of every page, moves it to another browser.

## Start

Open the home page and start the first module, **Same model, different
harness**. It shows the whole idea in one run and ends with a placement check
that tells you where to begin. The path after it is in prerequisite order, and
the course map on the home page marks where you are.

## Run it locally

The site is static, with no build step. Serve `site/` with any static server,
for example:

```sh
python3 -m http.server --directory site 8000
```

Then open <http://localhost:8000/>. The katas need the vendored Pyodide once:
`npm ci && node tools/vendor/copy_pyodide.mjs`.

Rein, the local package, runs from the repository root:

```sh
python -m pip install -e ./rein
python -m rein run --tape scenarios/d1-example-a.json --board scenarios/boards/d1-new.json --seed 0
```

See `rein/README.md` for the eval runner and the real-model adapter (your key,
with a spend cap).

## Contribute or check a change

Python tools need 3.11 or newer (CI uses 3.13); Node needs 22 or newer.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci
tools/ci_local.sh --committed --qa     # every check, then browser QA, on HEAD
```

`tools/ci_local.sh` runs the same checks as CI: the content, facts, snippets,
katas, steps, scenarios and wire checkers, the JS and Rein tests, the palette and
font checks, and with `--qa` the Playwright and axe pass over every page at 375,
768 and 1280 px in both themes. The single commands, each taking a module, kata,
tape or page, are in `docs/AUTHORING.md` section 11.

The rules live in `docs/`: `SPEC.md` (what the course is), `DESIGN.md`,
`CURRICULUM.md`, `AUTHORING.md` (the content contract), `ENGINE.md` (the harness
the simulator and Rein implement), `COMPONENTS.md`, `FACTS.md` (every product
and API claim is registered, sourced and dated) and `DECISIONS.md`.

## Deploy

GitHub Pages, from `.github/workflows/pages.yml`: when CI passes on a push to
`main`, the workflow uploads `site/` and nothing else. `source/` (the study book
the course was written from) and `capstone/` are never uploaded. A weekly job
(`facts-freshness.yml`) flags facts older than 75 days and dead source links;
GitHub runs scheduled jobs from the default branch.

## Layout

```text
source/              the study book the course was written from (reference only, never deployed)
docs/                SPEC, DESIGN, CURRICULUM, AUTHORING, ENGINE, COMPONENTS, FACTS, DECISIONS, BACKLOG
course.json          single source of truth (modules, graph, wires, counts)
site/                index, modules/, labs/, assets/{core,components,sim,py,fonts}
scenarios/           tapes (*.json), boards/, evals/, schema.json, golden/ traces
rein/                the local reference harness package, tests/, examples/
katas/               <id>/{starter.py,test_kata.py,solution.py,meta.yaml}
capstone/            the Rust capstone kit
facts/               facts registry (*.yaml)
tools/               checkers + qa/ (Playwright)
.claude/agents/      hx-builder.md, hx-reviewer.md, hx-factchecker.md
.github/workflows/   ci.yml, pages.yml, facts-freshness.yml
```

## Licenses

Code is MIT (`LICENSE`). Course content is CC BY-NC-SA 4.0, fonts are SIL OFL 1.1,
and `source/` is all rights reserved. See `LICENSE-CONTENT.md` for the full split.
