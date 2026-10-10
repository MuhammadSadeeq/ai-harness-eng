# BLUEPRINT BP-0.5B: course schema, content checker, data generator

Phase 0. Builder rules: `.claude/agents/hx-builder.md` (read it first; it
binds you). You never commit.

## Read first
- `docs/AUTHORING.md` (all; it is the contract your checker enforces)
- `docs/CURRICULUM.md` §3–§5 and `course.json` (the data you validate)
- `docs/DECISIONS.md` D-020 … D-023
- `tools/render_curriculum.py` (director-owned; import its `render()`; never edit it)
- `pyproject.toml` (ruff + mypy config; never edit)

## You own (create/edit only these)
```
tools/__init__.py                (empty)
tools/lib/__init__.py            (empty)
tools/lib/course.py
tools/schemas/course.schema.json
tools/check_content.py
tools/gen_data.py
tools/tests/__init__.py          (empty)
tools/tests/test_check_content.py
tools/tests/test_gen_data.py
tools/tests/test_course_lib.py
tools/tests/fixtures/content/**
```
Do not touch anything else. Another builder is writing `tools/check_facts.py`,
`check_snippets.py`, `check_katas.py`, stubs and their tests at the same time:
don't read or run their files. Use the venv read-only:
`/home/user/ai-harness-eng/.venv/bin/python` (pytest, ruff, mypy, pyyaml, jsonschema).
Scratch: `/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/build/B/`.

## Conventions (all tools)
- Python 3.11+, fully typed, passes `ruff check` and `mypy` (strict) with the
  repo config. Standard library + `yaml` + `jsonschema` only.
- Each checker: `def main(argv: list[str] | None = None) -> int`, and at the
  bottom `if __name__ == "__main__": raise SystemExit(main())`. Scripts must
  run as `python tools/check_content.py`: put the repo root on `sys.path` at
  the top (`sys.path.insert(0, str(Path(__file__).resolve().parent.parent))`)
  before importing `tools.lib`.
- Problems print as `path:line: message` (line 0 when unknown), one per line.
  The **last line** is `<tool>: <summary>` on success or
  `<tool>: FAILED (<n> problems)`; exit 1 on failure.
- Every function that a test needs takes paths as parameters (with repo
  defaults) so tests can point it at fixtures.

## Build

### 1. `tools/lib/course.py`
`load_course(path) -> dict`, `modules_by_id`, `ancestors(course, id) -> set[str]`
(transitive prerequisites, not primers), `kind_spec(course, kind)`,
`compute_counts(course) -> dict` (same keys and arithmetic as `course.json`
→ `counts`: modules, modules_by_kind (in `kinds` order), parts, wires,
objectives, terms_planned (unique lower-cased terms), failure_families,
minutes_path (sum over `path`), minutes_all), `term_owner(course) -> dict[str, str]`
(lower-cased term → module id), `REPO` (repo root path).

### 2. `tools/schemas/course.schema.json`
JSON Schema (draft 2020-12) for `course.json` as it exists now: required
top-level keys `schema, product, wires, parts, kinds, failure_families,
modules, path, counts`; wire fields; part fields; kinds as an object of
`{beats: [...], requires: [...]}`; module fields `id` (pattern
`^[A-Z][0-9]{1,2}$`), `slug` (kebab), `part`, `title`, `kind`, `wires`,
`prereqs`, `primers`, `minutes` (int > 0), `law`, `objectives` (items `{id, text}`,
id pattern `^<module id>\.o[0-9]+$` is checked in code), `misconceptions`,
`terms`, `interactions` (pattern `^hx-[a-z]+$`), `family` (string or null),
`source`, `volatile` (bool), `status` (`planned|draft|review|done`), optional
`local_terms`. `additionalProperties: false` on modules and wires.

### 3. `tools/check_content.py`
Usage: `python tools/check_content.py [PAGE_OR_DIR ...] [--course PATH] [--site DIR] [--content DIR]`.
With no page arguments it checks `course.json` and every page in `site/modules/`.

**A. course.json** (always):
1. Validates against the schema.
2. Every `wires`, `part`, `kind`, `prereqs`, `primers`, `family` reference exists;
   objective ids are `<id>.o1 … <id>.oN` in order; 3–6 objectives except primers (3).
3. The prerequisite graph is acyclic; `path` lists every non-primer module
   exactly once, in an order where every prerequisite comes first; primers are
   not in `path`.
4. Each term (case-insensitive) is owned by exactly one module.
5. Modules whose kind requires `incident` have a `family`; each failure
   family's `module` exists.
6. `counts` equals `compute_counts()` exactly (report each differing key).
7. `docs/CURRICULUM.md`'s generated block equals
   `render_curriculum.render(course)` (import it; report "run python
   tools/render_curriculum.py" when stale).

**B. Module pages** (`site/modules/*.html`; a page whose file name is not a
module slug is an error). Parse with `html.parser`. For a page of module M:
1. Skeleton (AUTHORING §2): doctype; `<html lang="en" data-module="M">`;
   `<title>` = `M.title + " · HARNESSED"`; exactly one `<h1>` equal to M.title;
   links `../assets/core/hx.css` and a module script `../assets/core/app.js`;
   a skip link to `#main`; `<main id="main">`.
2. Beats: `section.beat[data-beat]` elements in exactly the kind's beat order,
   each once, each with `id` equal to its beat, first heading inside is `<h2>`.
   Heading levels never skip (h1 → h2 → h3).
3. Requirements of the kind (`course.json` → `kinds[k].requires`):
   `incident` → an `hx-incident`, or `hx-replay` with a `predict` attribute,
   inside the `break` beat; `lab` → at least one lab element (any `hx-*` other
   than `hx-kata, hx-cards, hx-say, hx-check, hx-count, hx-step`) inside `fix`
   or `lab`; `kata` → `hx-kata` inside `fix`; `prove` → `hx-bench` inside
   `prove`; `check` → `hx-check` inside `check`; `step` → `hx-step` inside
   `fix`; `cards` → `hx-cards` in `keep`; `say` → `hx-say` in `keep`;
   `drill` → any of `hx-say, hx-design, hx-kata, hx-incident`.
   The `keep` beat contains `<p class="law">` whose text equals M.law.
4. Objective coverage: collect objective ids from every `data-objective`
   attribute in the page (space-separated), from `objective`/`objectives`
   fields in `content/M/*.yaml`, and from `objectives` in `katas/*/meta.yaml`
   whose `module` is M. Every M objective must appear at least once; an
   unknown objective id anywhere is an error.
5. Prose budget: count words in visible text of `p, li, h2, h3, figcaption,
   td, th, dt, dd, blockquote` inside `section.beat`, excluding anything inside
   `pre, code, script, style, svg` and any `hx-*` element. Warn (not fail)
   above 900; fail above 1,000. Print the count for each page.
6. No typed counts: in visible text (same exclusions), fail on
   `\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(modules?|katas?|parts|lessons?|labs?|objectives|failure families|terms|primers|cards)\b`
   (case-insensitive). "eight wires" and "five beats" are allowed.
7. Terms. Registry: every `content/*/terms.yaml` entry (`id, term, aliases,
   strict, wire, definition`); for planned terms without an entry, use
   `course.json` (`term` as the only alias, `strict: true` unless the
   lower-cased term is in this everyday list: task, environment, outcome,
   session, event, request, response, turn, exit, brief, queue, policy, reward,
   allow, ask, deny, guide, sensor, gate, reviewer, commit, process, header,
   image, mount, diff, signal, fixture, run, trial, seed, role, memory, usage,
   eval, framework, topology, experiment, baseline, planner, generator,
   evaluator, brain, hands, reset, checkpoint, canary, transport, skill, hook,
   container, secret, interrupt, guard, span, enum, probability, weights,
   training, inference, latency, reliability, entropy, calibration, variance,
   sandbox, permissions, verification, recovery, observability, wire).
   Then: (a) a `terms.yaml` entry's `term` must be planned for that module in
   `course.json`; (b) every `data-term` value must be a known term id
   (`id` from terms.yaml, or the kebab-case of a planned term); (c) `<dfn
   data-term=X>` may appear only in X's owner module, at most once; (d) the
   owner page must contain a `dfn` for each term it owns that has a
   terms.yaml entry; (e) **first use**: in visible prose (same exclusions, and
   also excluding `.fwd` spans), a strict term's aliases (case-insensitive,
   word boundaries, optional plural "s") may appear only if the owner is M or
   an ancestor of M, or the term is in M's `local_terms`. Report
   `term '<t>' is taught in <owner>`.
   (f) more than two `.fwd` spans in a page is an error.
8. Hygiene: no `style` attributes; no `<script>` other than the module script
   above; no `src` pointing outside the site (`http:`/`https:`).

Last line on success: `check_content: course.json OK (<n> modules), <p> pages OK`.

### 4. `tools/gen_data.py`
Usage: `python tools/gen_data.py [--check]`. Writes, deterministically
(`json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=True) + "\n"`):
- `site/data/course.json`: a copy of `course.json`.
- `site/data/facts.json`: from every `facts/*.yaml` (a list of mappings; empty
  or missing directory → `{}`), only entries whose `status` is `verified` (or
  absent): `{id: {claim, source, verified_on, volatility, kind?}}`.
- `site/data/terms.json`: merged `content/*/terms.yaml` entries keyed by id,
  each with its owner `module` added (empty object when none).
- For each `content/<ID>/{cards,say,checks}.yaml` that exists:
  `site/data/<cards|say|checks>/<ID>.json` (the list as-is).
- `README.md`: rewrite only between `<!-- BEGIN GENERATED: counts -->` and
  `<!-- END GENERATED -->` with this, values from `course.json` counts:
  `- <modules> modules in <parts> parts, <objectives> objectives, <failure_families> failure families, about <round(minutes_path/60)> hours of lessons on the default path.`
  If the README or its markers are missing, report a problem (don't create it).
- `--check`: compute everything in memory, write nothing, list stale or
  missing files, exit 1 if any (also report generated files under
  `site/data/` that wouldn't be produced). Last line
  `gen_data: <n> files up to date` / `gen_data: wrote <n> files`.
- YAML errors report `path:line: message`.

### 5. Tests (`tools/tests/`)
pytest, plain functions. Fixtures under `tools/tests/fixtures/content/`:
a minimal `course.json` with 3 modules (a concept module, a core module that
depends on it, and a primer with `local_terms`), matching `counts`, its own
small CURRICULUM-like doc if needed (or make the curriculum check skippable
with a parameter), one **good** page per kind used, and **one bad page per
rule** in B.1–B.8 (each must fail with the expected message and only that
rule). Also tests for A.2–A.6 by mutating the fixture course in memory. Test
`gen_data` against fixture inputs in a temp dir (including `--check`
detecting a stale file). Test `ancestors` and `compute_counts`.

## Acceptance (all must pass; quote the final output lines)
```
.venv/bin/python -m pytest tools/tests/test_check_content.py tools/tests/test_gen_data.py tools/tests/test_course_lib.py
.venv/bin/python tools/check_content.py          # real repo: course.json OK, 0 pages
.venv/bin/python tools/gen_data.py               # writes site/data/* (README block: report if markers missing)
.venv/bin/python tools/gen_data.py --check
.venv/bin/ruff check tools/lib tools/check_content.py tools/gen_data.py tools/tests/test_check_content.py tools/tests/test_gen_data.py tools/tests/test_course_lib.py
.venv/bin/mypy tools/lib tools/check_content.py tools/gen_data.py
```
`README.md` is being written by another builder; if it doesn't exist yet when
you run `gen_data.py`, that one problem is expected: say so in your report
instead of creating it.

## Report (short)
```
REPORT BP-0.5B
Files: …
Checks: <command> → <final line>
Deviations: … | none
Open doubts: … | none
```
