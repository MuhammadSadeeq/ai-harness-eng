# BLUEPRINT BP-0.5C: facts, snippets and kata checkers, stdlib runner, stubs, Rein skeleton

Phase 0. Builder rules: `.claude/agents/hx-builder.md` (read it first; it
binds you). You never commit.

## Read first
- `docs/FACTS.md` (all; `check_facts.py` enforces it)
- `docs/AUTHORING.md` §7, §8, §9, §11 and the snippet rule below
- `docs/DECISIONS.md` D-015, D-016, D-018, D-019
- `pyproject.toml` (ruff + mypy config; never edit)

## You own (create/edit only these)
```
tools/check_facts.py
tools/check_snippets.py
tools/check_katas.py
tools/check_steps.py
tools/check_scenarios.py
tools/check_wire.py
site/assets/py/hxtest.py
tools/tests/test_check_facts.py
tools/tests/test_check_snippets.py
tools/tests/test_check_katas.py
tools/tests/test_hxtest.py
tools/tests/test_stubs.py
tools/tests/fixtures/facts/**  tools/tests/fixtures/snippets/**  tools/tests/fixtures/katas/**
rein/pyproject.toml  rein/README.md  rein/src/rein/__init__.py  rein/src/rein/py.typed  rein/tests/test_smoke.py
```
Do not touch anything else. Another builder is creating `tools/__init__.py`,
`tools/tests/__init__.py`, `tools/lib/`, `check_content.py`, `gen_data.py`
at the same time: don't create, edit or depend on those files. If
`tools/__init__.py` or `tools/tests/__init__.py` doesn't exist yet when you
run tests, run pytest with `--rootdir=.` from the repo root and import your
checkers in tests via `importlib.util.spec_from_file_location` on the file
path (that works either way). Use the venv read-only:
`/home/user/ai-harness-eng/.venv/bin/python` (pytest, ruff, mypy, pyyaml,
jsonschema, anthropic, pydantic). Scratch:
`/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/build/C/`.

## Conventions (all tools)
- Python 3.11+, fully typed, passes `ruff check` and `mypy` (strict) with the
  repo config. Standard library + `yaml` + `jsonschema` only (no anthropic
  imports in Phase 0).
- `def main(argv: list[str] | None = None) -> int`; bottom:
  `if __name__ == "__main__": raise SystemExit(main())`. Each file is
  self-contained (no imports from `tools.lib`).
- Problems print as `path:line: message` (line 0 when unknown). The **last
  line** is `<tool>: <summary>` or `<tool>: FAILED (<n> problems)`; exit 1 on
  failure. Paths are parameters with repo defaults, so tests use fixtures.
- **A stub may pass only on empty input.** If real inputs exist and the part
  that would check them isn't built yet, the stub fails loudly. Nothing passes
  silently.

## Build

### 1. `tools/check_facts.py`
Usage: `check_facts.py [--facts DIR] [--site DIR] [--today YYYY-MM-DD] [--links] [--warn-days N]`.
1. Load every `facts/*.yaml` (missing/empty dir = zero facts). Each file is a
   YAML list of mappings. Required: `id, claim, source, quote, verified_on,
   volatility`. Optional: `status` (default `verified`; one of `verified,
   unverifiable, contradicted`), `kind` (`company-report, paper, spec, docs`),
   `value` (mapping), `note`, `source_alt`. Unknown keys are errors.
2. `id` matches `^[a-z0-9]+(\.[a-z0-9-]+)+$`, starts with `<file stem>.`, and
   is unique across files. `source`/`source_alt` start with `https://`.
   `verified_on` is a real date, not after `--today`. `claim` and `quote` are
   non-empty strings. `note` is required when `status` isn't `verified`.
3. Freshness: a `volatile` fact older than 90 days (vs `--today`, default
   today) is an error if any page uses it, else a warning. With
   `--warn-days N` (default 75), also warn for facts older than N days.
4. Pages: scan `site/**/*.html` (skip `site/vendor/`) for `data-fact="<id>"`.
   Unknown id → error; status not `verified` → error (FACTS §4).
5. `--links`: for each `source` (and `source_alt`), HTTP HEAD with a 15 s
   timeout and a browser-like User-Agent, falling back to GET on 405/403;
   report status ≥ 400 or network failure as errors. (Tests must not touch the
   network: inject the fetch function.)
Last line: `check_facts: <n> facts OK (<v> verified, <u> unverifiable, <c> contradicted), <r> page references`.

### 2. `tools/check_snippets.py`
Usage: `check_snippets.py [PATH ...]` (files or dirs; default `site/`, skip `site/vendor/`).
- Find every `<pre data-run>` element; its code is the element's text
  (entities unescaped; a single `<code>` child is fine). Optional attributes:
  `data-raises="ExcName"`, `data-timeout="<seconds>"` (default 10).
- Expected output: the **next element sibling** must be `<pre data-output>`
  unless `data-raises` is set (then an output block is optional and compared
  only against stdout printed before the exception).
- Each snippet must import only standard-library modules
  (`sys.stdlib_module_names`; check with `ast`).
- Run with the current interpreter as `python -I -X utf8 -c <code>` in a
  fresh temp directory, with the timeout. Compare stdout to the expected text
  after normalizing line endings and stripping trailing whitespace on each
  line and trailing blank lines. With `data-raises`, the process must exit
  non-zero and the last stderr line must start with `ExcName` (`ExcName:` or
  exactly `ExcName`).
- Report the snippet's source line number in the HTML.
Last line: `check_snippets: <n> snippets OK in <f> files`.

### 3. `site/assets/py/hxtest.py` (the stdlib kata runner, also used in Pyodide)
Pure standard library, no third-party imports, Python 3.11+ and 3.14
compatible (it will run in Pyodide 314). Typed.
- `run(test_path: str) -> dict` and CLI `python hxtest.py <test_file.py> [--json]`.
- Imports the test file as a module with its directory first on `sys.path`
  (so `import kata` works), and removes any cached `kata` module from
  `sys.modules` first.
- Collects top-level functions named `test_*` **in source order**; runs each;
  outcome `passed`, `failed` (AssertionError) or `error` (any other exception,
  including import errors of the test file → one `error` named `<collection>`).
- Failure messages: the assertion's own message if it has one; otherwise
  re-read the failing `assert` from the test source (traceback line number in
  the test file) and, if it's a single comparison (`ast.Compare` with one
  operator), evaluate both sides in the frame's globals/locals and report
  `assert <left!r> <op> <right!r>` (for example `assert 3 == 4`); else report
  the assert's source text.
- Result: `{"tests": [{"name", "outcome", "message"}], "passed": n, "failed": n, "errors": n}`.
  CLI prints `PASS name` / `FAIL name: message` / `ERROR name: message` lines
  and `hxtest: <p> passed, <f> failed, <e> errors`; `--json` prints the dict
  instead. Exit 0 only if nothing failed or errored.

### 4. `tools/check_katas.py`
Usage: `check_katas.py [ID ...] [--katas DIR] [--course PATH] [--pyodide]`.
For each kata folder (all under `katas/` when no ids; skip names starting
with `.`):
1. Files: `meta.yaml`, `starter.py`, `solution.py`, `test_kata.py`.
   `meta.yaml` keys: `id` (= folder name), `module` (a module id in
   `course.json`; skip this check when `--course none`), `title`,
   `objectives` (non-empty list; each must be an objective id of `module`),
   `minutes` (int), `hints` (exactly 3 strings), `from_memory` (bool),
   optional `wrong_solutions` (list of `{name, code}`).
2. Starter, solution, tests and each wrong solution import only standard
   library modules (plus `kata` in the tests).
3. For each candidate (starter, solution, each wrong solution): make a temp
   dir with `kata.py` (the candidate) and `test_kata.py`; run
   (a) `python -m pytest -q -p no:cacheprovider --junitxml=<tmp>/r.xml test_kata.py`
   and (b) `python <repo>/site/assets/py/hxtest.py test_kata.py --json`, each
   with a 60 s timeout. Parse per-test outcomes from both. The two runners
   must agree on every test's pass/fail (`error` counts as fail). Then:
   starter must fail at least one test; solution must pass all; every wrong
   solution must fail at least one test.
4. `--pyodide`: not built until Phase 1. If any kata exists, fail with
   `pyodide runner not implemented (Phase 1)`; with zero katas, pass.
Last line: `check_katas: <n> katas OK (<c> candidates, runners agree)`.

### 5. Guarded stubs (final shape arrives in later phases)
- `tools/check_steps.py`: if `rein/steps/` is missing or empty → last line
  `check_steps: 0 steps (Rein steps arrive in Phase 2)`, exit 0; otherwise
  fail `check_steps: FAILED (step checking not implemented yet)`.
- `tools/check_scenarios.py`: every `scenarios/*.json` must parse as a JSON
  object whose `id` equals the file stem; if `scenarios/schema.json` exists,
  validate tapes against it with `jsonschema`. With zero tapes → last line
  `check_scenarios: 0 tapes`, exit 0. With any tape → fail with
  `parity not implemented (Phase 1)` after the schema checks.
- `tools/check_wire.py`: with no payload files under `scenarios/wire/` → last
  line `check_wire: 0 payloads`, exit 0; otherwise fail
  `wire validation not implemented (Phase 1)`.

### 6. Rein skeleton
- `rein/pyproject.toml`: `[build-system] requires = ["setuptools>=69"]`,
  `build-backend = "setuptools.build_meta"`; project `name = "rein"`,
  `version = "0.0.0"`, `requires-python = ">=3.11"`, no dependencies;
  src layout (`[tool.setuptools.packages.find] where = ["src"]`), package data
  `py.typed`; `[tool.ruff]` line-length 100, target py311, same lint select as
  the root; `[tool.mypy] strict = true`, `files = ["src"]`;
  `[tool.pytest.ini_options] testpaths = ["tests"]`.
- `rein/src/rein/__init__.py`: module docstring "Rein: a small, complete
  agent harness, built one step at a time." and `__version__ = "0.0.0"`.
- `rein/src/rein/py.typed`: empty. `rein/tests/test_smoke.py`: imports `rein`,
  asserts `__version__` is a non-empty string. `rein/README.md`: two short
  paragraphs (what Rein is; that it is built in Part H of the course).

### 7. Tests (`tools/tests/`)
pytest, plain functions, no network, no real repo data. Fixtures:
- `fixtures/facts/`: a good registry (2 files, volatile + stable, one
  unverifiable with a note), and bad cases (bad id, duplicate, wrong prefix,
  missing key, unknown key, future date, stale volatile used by a page,
  unverifiable used by a page, unknown id in a page). `--links` tested with an
  injected fake fetcher.
- `fixtures/snippets/`: pages with a passing snippet, a wrong-output snippet,
  a `data-raises` snippet (passing and failing), a missing output block, a
  non-stdlib import, a timeout (use `data-timeout="1"`).
- `fixtures/katas/`: one good kata (starter fails, solution passes, one
  wrong solution fails), one whose starter passes (must be reported), one
  whose wrong solution passes, and one where the two runners would disagree if
  the runner were broken (e.g. a test that only fails on a precise value).
- `test_hxtest.py`: source order, `assert 3 == 4` message rewriting, own
  messages, errors vs failures, collection error, `--json`.
- `test_stubs.py`: each stub passes on empty input and fails on non-empty input.

## Acceptance (all must pass; quote the final output lines)
```
.venv/bin/python -m pytest tools/tests/test_check_facts.py tools/tests/test_check_snippets.py tools/tests/test_check_katas.py tools/tests/test_hxtest.py tools/tests/test_stubs.py
.venv/bin/python tools/check_facts.py
.venv/bin/python tools/check_snippets.py
.venv/bin/python tools/check_katas.py
.venv/bin/python tools/check_steps.py
.venv/bin/python tools/check_scenarios.py
.venv/bin/python tools/check_wire.py
.venv/bin/ruff check tools/check_facts.py tools/check_snippets.py tools/check_katas.py tools/check_steps.py tools/check_scenarios.py tools/check_wire.py site/assets/py/hxtest.py tools/tests/test_check_facts.py tools/tests/test_check_snippets.py tools/tests/test_check_katas.py tools/tests/test_hxtest.py tools/tests/test_stubs.py
.venv/bin/mypy tools/check_facts.py tools/check_snippets.py tools/check_katas.py tools/check_steps.py tools/check_scenarios.py tools/check_wire.py site/assets/py/hxtest.py
cd rein && ../.venv/bin/python -m pytest && ../.venv/bin/ruff check . && ../.venv/bin/mypy
```
(For the rein tests, run with `PYTHONPATH=src` instead of installing into the shared venv; never pip-install into `.venv`.)

## Report (short)
```
REPORT BP-0.5C
Files: …
Checks: <command> → <final line>
Deviations: … | none
Open doubts: … | none
```
