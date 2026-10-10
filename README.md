# HARNESSED

An interactive course that takes you from zero to a hireable AI harness engineer.

Status: Phase 0 (foundations)

## Run locally

Python tools need 3.11 or newer (CI uses 3.13). Node needs 22 or newer.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci
```

Checks (the commands from `docs/AUTHORING.md` section 11; each takes a module, kata, tape or page as argument):

```sh
.venv/bin/python tools/check_content.py site/modules/<slug>.html
.venv/bin/python tools/check_snippets.py site/modules/<slug>.html
.venv/bin/python tools/check_katas.py <kata ids>
.venv/bin/python tools/check_scenarios.py <tape ids>
.venv/bin/python tools/check_facts.py
node tools/qa/run.mjs --only modules/<slug>.html
```

Design system and fonts:

```sh
.venv/bin/python tools/vendor/build_fonts.py   # rebuilds site/assets/fonts/
.venv/bin/python tools/qa/check_palette.py      # wire palette thresholds
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --cvd
```

The site has no build step: serve `site/` with any static server.

## Layout

```text
source/              owner's study book (reference only)
docs/                SPEC, DESIGN, CURRICULUM, AUTHORING, FACTS, DECISIONS, BACKLOG
course.json          single source of truth (modules, graph, wires, counts)
site/                index, modules/, labs/, assets/{core,components,sim,py,fonts}
scenarios/           tapes (*.json), schema.json, golden/ traces
rein/                local reference harness package, tests/, evals/
katas/               <id>/{starter.py,test_*.py,solution.py,meta.yaml}
facts/               facts registry (*.yaml)
tools/               checkers + qa/ (Playwright)
.claude/agents/      hx-builder.md, hx-reviewer.md, hx-factchecker.md
.github/workflows/   ci.yml, pages.yml, facts-freshness.yml
```

## Licenses

Code is MIT (`LICENSE`). Course content is CC BY-NC-SA 4.0, fonts are SIL OFL 1.1,
and `source/` is all rights reserved. See `LICENSE-CONTENT.md` for the full split.

<!-- BEGIN GENERATED: counts -->
- 69 modules in 11 parts, 267 objectives, 35 failure families, about 46 hours of lessons on the default path.
<!-- END GENERATED -->
